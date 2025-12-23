/**
 * 데이터 서비스
 *
 * 정적 JSON 데이터를 로드하고, 오프라인 캐싱 및 CDN 업데이트를 처리합니다.
 * 백엔드 API 없이 동작할 수 있도록 설계되었습니다.
 */

import type { IntegratedGroupResponse } from './api'

// 데이터 소스 설정
const DATA_BASE_URL = import.meta.env.VITE_DATA_URL || '/data'
const CDN_BASE_URL = import.meta.env.VITE_CDN_URL || null  // CDN URL (설정 시 업데이트 체크)

// 캐시 키
const CACHE_KEY_PREFIX = 'aff_cache_'

// 기업집단 목록 타입
export interface GroupItem {
  code: string
  name: string
  owner: string | null
  representative_company: string
  affiliate_count: number
  group_type: string | null
  is_public: boolean
}

export interface GroupsData {
  total: number
  items: GroupItem[]
}

export interface Manifest {
  version: string
  generated_at: string
  total_groups: number
  data_source: string
}

// 계열사 인덱스 타입
export interface AffiliateIndexItem {
  id: number
  name: string
  group_code: string
  group_name: string | null
  ceo: string | null
}

// 검색 결과 타입
export interface SearchResultStatic {
  total: number
  groups: Array<{
    id: number
    code: string
    name: string
    owner: string | null
    affiliate_count: number
  }>
  affiliates: Array<{
    id: number
    name: string
    group_code: string
    group_name: string | null
    ceo: string | null
  }>
}

/**
 * 로컬 스토리지에서 캐시 데이터 가져오기
 */
function getFromCache<T>(key: string): T | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY_PREFIX + key)
    if (cached) {
      return JSON.parse(cached)
    }
  } catch (e) {
    console.warn('캐시 읽기 실패:', e)
  }
  return null
}

/**
 * 로컬 스토리지에 캐시 데이터 저장
 */
function saveToCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify(data))
  } catch (e) {
    console.warn('캐시 저장 실패:', e)
    // 스토리지 용량 초과 시 오래된 캐시 삭제
    clearOldCache()
    try {
      localStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify(data))
    } catch {
      // 무시
    }
  }
}

/**
 * 오래된 캐시 삭제
 */
function clearOldCache(): void {
  const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_KEY_PREFIX))
  // 처음 절반의 캐시 삭제
  keys.slice(0, Math.floor(keys.length / 2)).forEach(k => localStorage.removeItem(k))
}

/**
 * 매니페스트 로드 (버전 정보)
 */
async function loadManifest(baseUrl: string): Promise<Manifest | null> {
  try {
    const response = await fetch(`${baseUrl}/manifest.json`)
    if (response.ok) {
      return await response.json()
    }
  } catch (e) {
    console.warn('매니페스트 로드 실패:', e)
  }
  return null
}

/**
 * CDN에서 업데이트 확인
 */
export async function checkForUpdates(): Promise<{ hasUpdate: boolean; newVersion?: string }> {
  if (!CDN_BASE_URL) {
    return { hasUpdate: false }
  }

  const cachedManifest = getFromCache<Manifest>('manifest')
  const remoteManifest = await loadManifest(CDN_BASE_URL)

  if (remoteManifest && (!cachedManifest || remoteManifest.version !== cachedManifest.version)) {
    return { hasUpdate: true, newVersion: remoteManifest.version }
  }

  return { hasUpdate: false }
}

/**
 * 기업집단 목록 로드
 */
export async function fetchGroupsStatic(keyword?: string): Promise<GroupsData> {
  // 캐시 확인
  const cached = getFromCache<GroupsData>('groups')

  // 네트워크에서 로드 시도
  try {
    const response = await fetch(`${DATA_BASE_URL}/groups.json`)
    if (response.ok) {
      const data: GroupsData = await response.json()
      saveToCache('groups', data)

      // 키워드 필터링
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase()
        return {
          total: data.items.filter(g =>
            g.name.toLowerCase().includes(lowerKeyword) ||
            (g.owner && g.owner.toLowerCase().includes(lowerKeyword))
          ).length,
          items: data.items.filter(g =>
            g.name.toLowerCase().includes(lowerKeyword) ||
            (g.owner && g.owner.toLowerCase().includes(lowerKeyword))
          )
        }
      }

      return data
    }
  } catch (e) {
    console.warn('네트워크 로드 실패, 캐시 사용:', e)
  }

  // 캐시에서 반환
  if (cached) {
    if (keyword) {
      const lowerKeyword = keyword.toLowerCase()
      return {
        total: cached.items.filter(g =>
          g.name.toLowerCase().includes(lowerKeyword) ||
          (g.owner && g.owner.toLowerCase().includes(lowerKeyword))
        ).length,
        items: cached.items.filter(g =>
          g.name.toLowerCase().includes(lowerKeyword) ||
          (g.owner && g.owner.toLowerCase().includes(lowerKeyword))
        )
      }
    }
    return cached
  }

  throw new Error('데이터를 불러올 수 없습니다. 인터넷 연결을 확인해주세요.')
}

/**
 * 기업집단 통합 데이터 로드
 */
export async function fetchIntegratedGroupStatic(groupCode: string): Promise<IntegratedGroupResponse> {
  // 캐시 확인
  const cached = getFromCache<IntegratedGroupResponse>(`integrated_${groupCode}`)

  // 네트워크에서 로드 시도
  try {
    const response = await fetch(`${DATA_BASE_URL}/integrated/${groupCode}.json`)
    if (response.ok) {
      const data: IntegratedGroupResponse = await response.json()
      saveToCache(`integrated_${groupCode}`, data)
      return data
    }
  } catch (e) {
    console.warn('네트워크 로드 실패, 캐시 사용:', e)
  }

  // 캐시에서 반환
  if (cached) {
    return cached
  }

  throw new Error('데이터를 불러올 수 없습니다.')
}

/**
 * 모든 데이터 프리로드 (오프라인 사용을 위해)
 */
export async function preloadAllData(
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const groups = await fetchGroupsStatic()
  const total = groups.items.length

  for (let i = 0; i < groups.items.length; i++) {
    const group = groups.items[i]
    try {
      await fetchIntegratedGroupStatic(group.code)
      onProgress?.(i + 1, total)
    } catch (e) {
      console.warn(`${group.name} 프리로드 실패:`, e)
    }
  }
}

/**
 * 캐시 용량 확인
 */
export function getCacheInfo(): { count: number; estimatedSize: string } {
  const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_KEY_PREFIX))
  let totalSize = 0
  keys.forEach(k => {
    totalSize += (localStorage.getItem(k)?.length || 0) * 2  // UTF-16
  })

  return {
    count: keys.length,
    estimatedSize: totalSize > 1024 * 1024
      ? `${(totalSize / 1024 / 1024).toFixed(1)} MB`
      : `${(totalSize / 1024).toFixed(0)} KB`
  }
}

/**
 * 캐시 초기화
 */
export function clearCache(): void {
  Object.keys(localStorage)
    .filter(k => k.startsWith(CACHE_KEY_PREFIX))
    .forEach(k => localStorage.removeItem(k))
}

/**
 * 계열사 인덱스 로드
 */
async function loadAffiliatesIndex(): Promise<AffiliateIndexItem[]> {
  const cached = getFromCache<AffiliateIndexItem[]>('affiliates_index')

  try {
    const response = await fetch(`${DATA_BASE_URL}/affiliates_index.json`)
    if (response.ok) {
      const data: AffiliateIndexItem[] = await response.json()
      saveToCache('affiliates_index', data)
      return data
    }
  } catch (e) {
    console.warn('계열사 인덱스 로드 실패:', e)
  }

  return cached || []
}

/**
 * 통합 검색 (기업집단 + 계열사)
 */
export async function searchAllStatic(keyword: string): Promise<SearchResultStatic> {
  if (!keyword || keyword.trim().length === 0) {
    return { total: 0, groups: [], affiliates: [] }
  }

  const lowerKeyword = keyword.toLowerCase().trim()

  // 그룹 검색
  const groupsData = await fetchGroupsStatic()
  const matchedGroups = groupsData.items
    .filter(g =>
      g.name.toLowerCase().includes(lowerKeyword) ||
      (g.owner && g.owner.toLowerCase().includes(lowerKeyword))
    )
    .map((g, idx) => ({
      id: idx,
      code: g.code,
      name: g.name,
      owner: g.owner,
      affiliate_count: g.affiliate_count
    }))

  // 계열사 검색
  const affiliatesIndex = await loadAffiliatesIndex()
  const matchedAffiliates = affiliatesIndex
    .filter(a =>
      a.name.toLowerCase().includes(lowerKeyword) ||
      (a.ceo && a.ceo.toLowerCase().includes(lowerKeyword))
    )
    .slice(0, 50) // 최대 50개로 제한

  return {
    total: matchedGroups.length + matchedAffiliates.length,
    groups: matchedGroups,
    affiliates: matchedAffiliates
  }
}
