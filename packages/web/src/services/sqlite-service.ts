/**
 * SQLite 서비스
 *
 * sql.js를 사용하여 브라우저에서 SQLite DB를 직접 쿼리합니다.
 * 웹과 Android 모두에서 동작합니다.
 */

import initSqlJs, { Database } from 'sql.js'

// 타입 정의
export interface CorporateGroup {
  id: number
  code: string
  name: string
  owner: string | null
  representative_company: string | null
  affiliate_count: number
  group_type: string | null
  is_public: boolean
}

export interface Affiliate {
  id: number
  group_code: string
  name: string
  corporate_number: string | null
  ceo: string | null
}

export interface HoldingRelation {
  holding_corp_number: string
  holding_group_name: string
  subsidiary_corp_number: string
  subsidiary_name: string
  parent_corp_number: string | null
  ownership_rate: number | null
  relation_type: string | null
  finance_type: string | null
}

export interface Stockholder {
  corp_number: string
  stockholder_name: string
  stockholder_type: string | null
  common_rate: number | null
  preferred_rate: number | null
  total_rate: number | null
}

export interface CompanyNode {
  name: string
  corp_number: string
  ownership_rate: number | null
  relation_type: string | null
  source: string
  inferred: boolean
  legal_parent_name: string | null
  largest_stockholder: string | null
  largest_stockholder_rate: number | null
  parent_mismatch: boolean
  children: CompanyNode[]
}

export interface IntegratedGroupResponse {
  group_code: string
  group_name: string
  owner: string | null
  holding_company: string | null
  holding_corp_number: string | null
  finance_type: string | null
  tree: CompanyNode[]
  other_affiliates: CompanyNode[]
  stats: {
    total_affiliates: number
    in_holding_structure: number
    other_affiliates: number
    inferred_relations: number
    subsidiaries: number
    grandchildren: number
    great_grandchildren: number
  }
}

export interface StockholderInfo {
  stockholder_name: string
  stockholder_type: string | null
  common_rate: number | null
  preferred_rate: number | null
  total_rate: number | null
  is_corporate: boolean
}

export interface StockholderResponse {
  corp_number: string
  stockholders: StockholderInfo[]
  corporate_count: number
  individual_count: number
  individual_total_rate: number
}

// 싱글톤 DB 인스턴스
let db: Database | null = null
let dbPromise: Promise<Database> | null = null

/**
 * DB 초기화
 */
async function initDB(): Promise<Database> {
  if (db) return db
  if (dbPromise) return dbPromise

  dbPromise = (async () => {
    const SQL = await initSqlJs({
      locateFile: (file: string) => `/sql-wasm/${file}`
    })

    // DB 파일 로드
    const response = await fetch('/affiliate.db')
    const buffer = await response.arrayBuffer()
    db = new SQL.Database(new Uint8Array(buffer))

    return db
  })()

  return dbPromise
}

/**
 * 회사명 정규화
 */
function normalizeCompanyName(name: string): string {
  if (!name) return ''
  return name.replace(/\(주\)/g, '').replace(/㈜/g, '').replace(/주식회사/g, '').replace(/ /g, '').trim()
}

/**
 * 최대 법인 주주 찾기
 */
function findLargestCorporateStockholder(
  stockholders: Stockholder[]
): { name: string | null; rate: number | null } {
  let bestName: string | null = null
  let bestRate = 0

  for (const s of stockholders) {
    const type = s.stockholder_type || ''
    if (type.includes('개인')) continue
    if (['친족', '임원'].some(kw => type.includes(kw))) continue

    const rate = s.total_rate || 0
    if (rate > bestRate) {
      bestRate = rate
      bestName = s.stockholder_name
    }
  }

  return bestName ? { name: bestName, rate: bestRate } : { name: null, rate: null }
}

/**
 * 주주 목록에서 계열사 부모 찾기
 */
function findParentAffiliate(
  stockholders: Stockholder[],
  targetCorpNumbers: Set<string>,
  affiliateNameMap: Map<string, string>
): { corpNumber: string | null; rate: number | null } {
  for (const s of stockholders) {
    const type = s.stockholder_type || ''
    if (type.includes('개인')) continue
    if (['친족', '임원'].some(kw => type.includes(kw))) continue

    const stockholderName = s.stockholder_name || ''
    for (const corpNum of targetCorpNumbers) {
      const affiliateName = affiliateNameMap.get(corpNum) || ''
      const normalizedStockholder = normalizeCompanyName(stockholderName)
      const normalizedAffiliate = normalizeCompanyName(affiliateName)
      if (normalizedStockholder && normalizedAffiliate && normalizedStockholder === normalizedAffiliate) {
        return { corpNumber: corpNum, rate: s.total_rate }
      }
    }
  }
  return { corpNumber: null, rate: null }
}

// ============ 공개 API ============

/**
 * 기업집단 목록 조회
 */
export async function fetchGroups(keyword?: string): Promise<{ total: number; items: CorporateGroup[] }> {
  const database = await initDB()

  let query = 'SELECT * FROM corporate_groups'
  const params: string[] = []

  if (keyword) {
    query += ' WHERE name LIKE ? OR owner LIKE ?'
    params.push(`%${keyword}%`, `%${keyword}%`)
  }

  query += ' ORDER BY affiliate_count DESC'

  const result = database.exec(query, params)

  if (result.length === 0) {
    return { total: 0, items: [] }
  }

  const columns = result[0].columns
  const items: CorporateGroup[] = result[0].values.map((row: unknown[]) => {
    const obj: Record<string, unknown> = {}
    columns.forEach((col: string, i: number) => { obj[col] = row[i] })
    return obj as unknown as CorporateGroup
  })

  return { total: items.length, items }
}

/**
 * 통합 검색
 */
export async function searchAll(keyword: string): Promise<{
  total: number
  groups: Array<{ id: number; code: string; name: string; owner: string | null; affiliate_count: number }>
  affiliates: Array<{ id: number; name: string; group_code: string; group_name: string | null; ceo: string | null }>
}> {
  if (!keyword || keyword.trim().length === 0) {
    return { total: 0, groups: [], affiliates: [] }
  }

  const database = await initDB()
  const searchTerm = `%${keyword}%`

  // 그룹 검색
  const groupResult = database.exec(
    'SELECT id, code, name, owner, affiliate_count FROM corporate_groups WHERE name LIKE ? OR owner LIKE ? LIMIT 20',
    [searchTerm, searchTerm]
  )

  const groups = groupResult.length > 0
    ? groupResult[0].values.map((row: unknown[]) => ({
        id: row[0] as number,
        code: row[1] as string,
        name: row[2] as string,
        owner: row[3] as string | null,
        affiliate_count: row[4] as number
      }))
    : []

  // 계열사 검색
  const affiliateResult = database.exec(
    `SELECT a.id, a.name, a.group_code, g.name as group_name, a.ceo
     FROM affiliates a
     LEFT JOIN corporate_groups g ON a.group_code = g.code
     WHERE a.name LIKE ? OR a.ceo LIKE ?
     LIMIT 50`,
    [searchTerm, searchTerm]
  )

  const affiliates = affiliateResult.length > 0
    ? affiliateResult[0].values.map((row: unknown[]) => ({
        id: row[0] as number,
        name: row[1] as string,
        group_code: row[2] as string,
        group_name: row[3] as string | null,
        ceo: row[4] as string | null
      }))
    : []

  return {
    total: groups.length + affiliates.length,
    groups,
    affiliates
  }
}

/**
 * 통합 그룹 데이터 조회 (지주회사 트리 + 기타 계열사)
 */
export async function fetchIntegratedGroup(groupCode: string): Promise<IntegratedGroupResponse> {
  const database = await initDB()

  // 1. 기업집단 정보
  const groupResult = database.exec(
    'SELECT * FROM corporate_groups WHERE code = ?',
    [groupCode]
  )

  if (groupResult.length === 0 || groupResult[0].values.length === 0) {
    throw new Error('기업집단을 찾을 수 없습니다')
  }

  const groupCols = groupResult[0].columns
  const groupRow = groupResult[0].values[0] as unknown[]
  const group: Record<string, unknown> = {}
  groupCols.forEach((col: string, i: number) => { group[col] = groupRow[i] })

  // 2. 계열사 목록
  const affiliateResult = database.exec(
    'SELECT * FROM affiliates WHERE group_code = ?',
    [groupCode]
  )

  const affiliates: Affiliate[] = affiliateResult.length > 0
    ? affiliateResult[0].values.map((row: unknown[]) => {
        const obj: Record<string, unknown> = {}
        affiliateResult[0].columns.forEach((col: string, i: number) => { obj[col] = row[i] })
        return obj as unknown as Affiliate
      })
    : []

  const affiliateCorpNumbers = new Set(affiliates.filter(a => a.corporate_number).map(a => a.corporate_number!))
  const affiliateNameMap = new Map(affiliates.filter(a => a.corporate_number).map(a => [a.corporate_number!, a.name]))

  // 3. 주주현황 조회
  const stockholderResult = database.exec(
    `SELECT * FROM stockholders WHERE corp_number IN (${Array.from(affiliateCorpNumbers).map(() => '?').join(',')})`,
    Array.from(affiliateCorpNumbers)
  )

  const stockholdersByCompany = new Map<string, Stockholder[]>()
  if (stockholderResult.length > 0) {
    const cols = stockholderResult[0].columns
    for (const row of stockholderResult[0].values as unknown[][]) {
      const obj: Record<string, unknown> = {}
      cols.forEach((col: string, i: number) => { obj[col] = row[i] })
      const s = obj as unknown as Stockholder
      if (!stockholdersByCompany.has(s.corp_number)) {
        stockholdersByCompany.set(s.corp_number, [])
      }
      stockholdersByCompany.get(s.corp_number)!.push(s)
    }
  }

  // 4. 지주회사 관계 찾기
  let holdingRelations: HoldingRelation[] = []
  let holdingInfo: { name: string; corp_number: string; finance_type: string | null } | null = null

  for (const affiliate of affiliates) {
    if (!affiliate.corporate_number) continue

    const holdingResult = database.exec(
      'SELECT * FROM holding_company_relations WHERE holding_corp_number = ?',
      [affiliate.corporate_number]
    )

    if (holdingResult.length > 0 && holdingResult[0].values.length > 0) {
      const cols = holdingResult[0].columns
      holdingRelations = holdingResult[0].values.map((row: unknown[]) => {
        const obj: Record<string, unknown> = {}
        cols.forEach((col: string, i: number) => { obj[col] = row[i] })
        return obj as unknown as HoldingRelation
      })

      holdingInfo = {
        name: holdingRelations[0].holding_group_name,
        corp_number: affiliate.corporate_number,
        finance_type: holdingRelations[0].finance_type
      }
      break
    }
  }

  // 5. 지주회사 트리 구조 생성
  const tree: CompanyNode[] = []
  const holdingCorpNumbers = new Set<string>()

  if (holdingRelations.length > 0 && holdingInfo) {
    const relationsByParent = new Map<string, HoldingRelation[]>()
    for (const r of holdingRelations) {
      const parent = r.parent_corp_number || holdingInfo.corp_number
      if (!relationsByParent.has(parent)) {
        relationsByParent.set(parent, [])
      }
      relationsByParent.get(parent)!.push(r)
      holdingCorpNumbers.add(r.subsidiary_corp_number)
    }

    function buildHoldingTree(parentCorpNumber: string, parentName: string): CompanyNode[] {
      const children: CompanyNode[] = []
      for (const r of relationsByParent.get(parentCorpNumber) || []) {
        const source = affiliateCorpNumbers.has(r.subsidiary_corp_number) ? 'both' : 'holding'
        const stockholders = stockholdersByCompany.get(r.subsidiary_corp_number) || []
        const { name: largestStockholder, rate: largestRate } = findLargestCorporateStockholder(stockholders)

        let parentMismatch = false
        if (largestStockholder) {
          const normalizedParent = normalizeCompanyName(parentName)
          const normalizedLargest = normalizeCompanyName(largestStockholder)
          if (normalizedParent && normalizedLargest && normalizedParent !== normalizedLargest) {
            parentMismatch = true
          }
        }

        children.push({
          name: r.subsidiary_name,
          corp_number: r.subsidiary_corp_number,
          ownership_rate: r.ownership_rate,
          relation_type: r.relation_type,
          source,
          inferred: false,
          legal_parent_name: parentName,
          largest_stockholder: largestStockholder,
          largest_stockholder_rate: largestRate,
          parent_mismatch: parentMismatch,
          children: buildHoldingTree(r.subsidiary_corp_number, r.subsidiary_name)
        })
      }
      return children
    }

    tree.push(...buildHoldingTree(holdingInfo.corp_number, holdingInfo.name))
    holdingCorpNumbers.add(holdingInfo.corp_number)
  }

  // 6. 기타 계열사 처리 (추론 포함)
  const otherCorpNumbers = new Set(
    affiliates
      .filter(a => a.corporate_number && !holdingCorpNumbers.has(a.corporate_number))
      .map(a => a.corporate_number!)
  )

  const inferredChildren = new Map<string, CompanyNode[]>()
  const otherAffiliateParentMap = new Map<string, { parent: string; rate: number | null }>()

  for (const affiliate of affiliates) {
    if (!affiliate.corporate_number || holdingCorpNumbers.has(affiliate.corporate_number)) continue

    const stockholders = stockholdersByCompany.get(affiliate.corporate_number) || []

    // 1차: 지주회사 구조에서 부모 찾기
    const { corpNumber: parentCorp, rate: ownershipRate } = findParentAffiliate(
      stockholders, holdingCorpNumbers, affiliateNameMap
    )

    if (parentCorp) {
      const parentName = affiliateNameMap.get(parentCorp) || ''
      const { name: largestStockholder, rate: largestRate } = findLargestCorporateStockholder(stockholders)

      let parentMismatch = false
      if (largestStockholder) {
        const normalizedParent = normalizeCompanyName(parentName)
        const normalizedLargest = normalizeCompanyName(largestStockholder)
        if (normalizedParent && normalizedLargest && normalizedParent !== normalizedLargest) {
          parentMismatch = true
        }
      }

      const childNode: CompanyNode = {
        name: affiliate.name,
        corp_number: affiliate.corporate_number,
        ownership_rate: ownershipRate,
        relation_type: '추론',
        source: 'affiliate',
        inferred: true,
        legal_parent_name: parentName,
        largest_stockholder: largestStockholder,
        largest_stockholder_rate: largestRate,
        parent_mismatch: parentMismatch,
        children: []
      }

      if (!inferredChildren.has(parentCorp)) {
        inferredChildren.set(parentCorp, [])
      }
      inferredChildren.get(parentCorp)!.push(childNode)
    } else {
      // 2차: 기타 계열사에서 부모 찾기
      const { corpNumber: otherParent, rate } = findParentAffiliate(
        stockholders, otherCorpNumbers, affiliateNameMap
      )
      if (otherParent && otherParent !== affiliate.corporate_number) {
        otherAffiliateParentMap.set(affiliate.corporate_number, { parent: otherParent, rate })
      }
    }
  }

  // 트리에 추론된 자식 연결
  function attachInferredChildren(nodes: CompanyNode[]): void {
    for (const node of nodes) {
      const inferred = inferredChildren.get(node.corp_number)
      if (inferred) {
        node.children.push(...inferred)
      }
      attachInferredChildren(node.children)
    }
  }
  attachInferredChildren(tree)

  // 지주회사에 직접 연결된 추론 자식
  if (holdingInfo && inferredChildren.has(holdingInfo.corp_number)) {
    tree.push(...inferredChildren.get(holdingInfo.corp_number)!)
  }

  // 처리된 회사 목록
  const processedCorpNumbers = new Set(holdingCorpNumbers)
  for (const children of inferredChildren.values()) {
    for (const child of children) {
      processedCorpNumbers.add(child.corp_number)
    }
  }

  // 기타 계열사 간 parent-child 맵
  const otherChildrenMap = new Map<string, Array<{ corp: string; rate: number | null }>>()
  const hasParentInOthers = new Set<string>()

  for (const [childCorp, { parent, rate }] of otherAffiliateParentMap) {
    if (processedCorpNumbers.has(childCorp)) continue
    if (!otherChildrenMap.has(parent)) {
      otherChildrenMap.set(parent, [])
    }
    otherChildrenMap.get(parent)!.push({ corp: childCorp, rate })
    hasParentInOthers.add(childCorp)
  }

  // 루트 기타 계열사 찾기
  const rootOtherAffiliates = affiliates.filter(
    a => a.corporate_number &&
         !processedCorpNumbers.has(a.corporate_number) &&
         !hasParentInOthers.has(a.corporate_number)
  )

  // 기타 계열사 트리 구성
  function buildOtherAffiliateTree(corpNumber: string, parentName: string, visited: Set<string>): CompanyNode[] {
    const children: CompanyNode[] = []
    if (visited.has(corpNumber)) return children
    visited.add(corpNumber)

    for (const { corp: childCorp, rate } of otherChildrenMap.get(corpNumber) || []) {
      if (visited.has(childCorp)) continue
      const childName = affiliateNameMap.get(childCorp) || childCorp
      const childStockholders = stockholdersByCompany.get(childCorp) || []
      const { name: largestStockholder, rate: largestRate } = findLargestCorporateStockholder(childStockholders)

      children.push({
        name: childName,
        corp_number: childCorp,
        ownership_rate: rate,
        relation_type: '추론',
        source: 'affiliate',
        inferred: true,
        legal_parent_name: parentName,
        largest_stockholder: largestStockholder,
        largest_stockholder_rate: largestRate,
        parent_mismatch: false,
        children: buildOtherAffiliateTree(childCorp, childName, new Set(visited))
      })
    }
    return children
  }

  const otherAffiliates: CompanyNode[] = rootOtherAffiliates.map(affiliate => {
    const corpNum = affiliate.corporate_number!
    const children = buildOtherAffiliateTree(corpNum, affiliate.name, new Set())
    const stockholders = stockholdersByCompany.get(corpNum) || []
    const { name: largestStockholder, rate: largestRate } = findLargestCorporateStockholder(stockholders)

    return {
      name: affiliate.name,
      corp_number: corpNum,
      ownership_rate: null,
      relation_type: null,
      source: 'affiliate',
      inferred: false,
      legal_parent_name: null,
      largest_stockholder: largestStockholder,
      largest_stockholder_rate: largestRate,
      parent_mismatch: false,
      children
    }
  })

  // 추론 관계 카운트
  let inferredCount = 0
  for (const children of inferredChildren.values()) {
    inferredCount += children.length
  }

  function countInferredInTree(nodes: CompanyNode[]): number {
    let count = 0
    for (const node of nodes) {
      if (node.inferred) count++
      count += countInferredInTree(node.children)
    }
    return count
  }
  inferredCount += countInferredInTree(otherAffiliates)

  // 통계
  const stats = {
    total_affiliates: affiliates.length,
    in_holding_structure: holdingCorpNumbers.size,
    other_affiliates: otherAffiliates.length,
    inferred_relations: inferredCount,
    subsidiaries: holdingRelations.filter(r => r.relation_type === '자회사').length,
    grandchildren: holdingRelations.filter(r => r.relation_type === '손자회사').length,
    great_grandchildren: holdingRelations.filter(r => r.relation_type === '증손자회사').length
  }

  return {
    group_code: groupCode,
    group_name: group.name as string,
    owner: group.owner as string | null,
    holding_company: holdingInfo?.name || null,
    holding_corp_number: holdingInfo?.corp_number || null,
    finance_type: holdingInfo?.finance_type || null,
    tree,
    other_affiliates: otherAffiliates,
    stats
  }
}

/**
 * 주주현황 조회
 */
export async function fetchStockholders(
  corpNumber: string,
  hideIndividuals: boolean = true
): Promise<StockholderResponse> {
  const database = await initDB()

  const result = database.exec(
    'SELECT * FROM stockholders WHERE corp_number = ? ORDER BY total_rate DESC',
    [corpNumber]
  )

  if (result.length === 0) {
    return {
      corp_number: corpNumber,
      stockholders: [],
      corporate_count: 0,
      individual_count: 0,
      individual_total_rate: 0
    }
  }

  const cols = result[0].columns
  const allStockholders: Stockholder[] = result[0].values.map((row: unknown[]) => {
    const obj: Record<string, unknown> = {}
    cols.forEach((col: string, i: number) => { obj[col] = row[i] })
    return obj as unknown as Stockholder
  })

  // 법인/개인 분류
  const stockholderInfos: StockholderInfo[] = allStockholders.map(s => {
    const type = s.stockholder_type || ''
    const isCorporate = !type.includes('개인') && !['친족', '임원'].some(kw => type.includes(kw))
    return {
      stockholder_name: s.stockholder_name,
      stockholder_type: s.stockholder_type,
      common_rate: s.common_rate,
      preferred_rate: s.preferred_rate,
      total_rate: s.total_rate,
      is_corporate: isCorporate
    }
  })

  const corporateCount = stockholderInfos.filter(s => s.is_corporate).length
  const individualCount = stockholderInfos.filter(s => !s.is_corporate).length
  const individualTotalRate = stockholderInfos
    .filter(s => !s.is_corporate)
    .reduce((sum, s) => sum + (s.total_rate || 0), 0)

  // 필터링
  const filtered = hideIndividuals
    ? stockholderInfos.filter(s => s.is_corporate)
    : stockholderInfos

  return {
    corp_number: corpNumber,
    stockholders: filtered,
    corporate_count: corporateCount,
    individual_count: individualCount,
    individual_total_rate: Math.round(individualTotalRate * 100) / 100
  }
}

/**
 * DB 연결 상태 확인
 */
export async function checkDBConnection(): Promise<boolean> {
  try {
    const database = await initDB()
    const result = database.exec('SELECT COUNT(*) FROM corporate_groups')
    return result.length > 0
  } catch {
    return false
  }
}
