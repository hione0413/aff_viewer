import type { GroupListResponse, AffiliateListResponse } from '../types'

const API_BASE = '/api'

export async function fetchGroups(keyword?: string): Promise<GroupListResponse> {
  const params = new URLSearchParams()
  if (keyword) params.set('keyword', keyword)

  const response = await fetch(`${API_BASE}/groups?${params}`)
  if (!response.ok) {
    throw new Error('기업집단 목록을 불러오는데 실패했습니다')
  }
  return response.json()
}

export async function fetchAffiliates(groupCode: string): Promise<AffiliateListResponse> {
  const response = await fetch(`${API_BASE}/affiliates?group_code=${groupCode}`)
  if (!response.ok) {
    throw new Error('계열사 목록을 불러오는데 실패했습니다')
  }
  return response.json()
}

export interface SearchResult {
  keyword: string
  total: number
  groups: {
    type: 'group'
    id: number
    code: string
    name: string
    owner: string | null
    affiliate_count: number
  }[]
  affiliates: {
    type: 'affiliate'
    id: number
    name: string
    group_code: string
    group_name: string | null
    ceo: string | null
  }[]
}

export async function searchAll(keyword: string): Promise<SearchResult> {
  const response = await fetch(`${API_BASE}/search?keyword=${encodeURIComponent(keyword)}`)
  if (!response.ok) {
    throw new Error('검색에 실패했습니다')
  }
  return response.json()
}

export async function triggerSync(): Promise<{ message: string; status: string }> {
  const response = await fetch(`${API_BASE}/sync`, { method: 'POST' })
  if (!response.ok) {
    throw new Error('동기화 요청에 실패했습니다')
  }
  return response.json()
}

// 지주회사 API
export interface HoldingGroup {
  name: string
  corp_number: string
  finance_type: string | null
}

export interface HoldingTreeNode {
  name: string
  corp_number: string
  ownership_rate: number
  relation_type: string
  children: HoldingTreeNode[]
}

export interface HoldingTreeResponse {
  holding_group_name: string
  holding_corp_number: string
  finance_type: string | null
  tree: HoldingTreeNode[]
}

export async function fetchHoldingGroups(): Promise<HoldingGroup[]> {
  const response = await fetch(`${API_BASE}/holding/groups`)
  if (!response.ok) {
    throw new Error('지주회사 목록을 불러오는데 실패했습니다')
  }
  return response.json()
}

export async function fetchHoldingTree(corpNumber: string): Promise<HoldingTreeResponse> {
  const response = await fetch(`${API_BASE}/holding/tree/${corpNumber}`)
  if (!response.ok) {
    throw new Error('지주회사 트리를 불러오는데 실패했습니다')
  }
  return response.json()
}

export async function syncHoldingRelations(): Promise<{ message: string; count: number }> {
  const response = await fetch(`${API_BASE}/holding/sync`, { method: 'POST' })
  if (!response.ok) {
    throw new Error('지주회사 동기화에 실패했습니다')
  }
  return response.json()
}

// 통합 API
export interface CompanyNode {
  name: string
  corp_number: string
  ownership_rate: number | null
  relation_type: string | null
  source: 'holding' | 'affiliate' | 'both'
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
    subsidiaries: number
    grandchildren: number
    great_grandchildren: number
  }
}

export async function fetchIntegratedGroup(groupCode: string): Promise<IntegratedGroupResponse> {
  const response = await fetch(`${API_BASE}/integrated/${groupCode}`)
  if (!response.ok) {
    throw new Error('통합 그룹 정보를 불러오는데 실패했습니다')
  }
  return response.json()
}
