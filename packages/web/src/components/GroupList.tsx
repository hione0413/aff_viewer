import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchGroups, searchAll, type SearchResult } from '../services/api'
import type { CorporateGroup } from '../types'

interface Props {
  onSelect: (group: CorporateGroup) => void
}

export function GroupList({ onSelect }: Props) {
  const [keyword, setKeyword] = useState('')

  // 키워드가 있으면 통합 검색, 없으면 그룹 목록
  const { data: groupsData, isLoading: groupsLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: () => fetchGroups(),
    enabled: !keyword,
  })

  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: ['search', keyword],
    queryFn: () => searchAll(keyword),
    enabled: keyword.length > 0,
  })

  const isLoading = keyword ? searchLoading : groupsLoading

  // 계열사 클릭 시 해당 그룹으로 이동
  const handleAffiliateClick = (groupCode: string, groupName: string | null) => {
    // 그룹 정보를 만들어서 전달
    const group: CorporateGroup = {
      id: 0,
      code: groupCode,
      name: groupName || '',
      owner: null,
      representative_company: null,
      affiliate_count: 0,
      group_type: null,
      is_public: false,
    }
    onSelect(group)
  }

  // 검색 결과 렌더링
  const renderSearchResults = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500">검색 중...</div>
        </div>
      )
    }

    if (!searchData) return null

    return (
      <>
        {/* 검색 결과 */}
        <div className="mb-4 text-sm text-gray-500">
          검색 결과 {searchData.total}건
        </div>

        {/* 기업집단 결과 */}
        {searchData.groups.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-700 mb-3">기업집단</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {searchData.groups.map((group) => (
                <div
                  key={group.id}
                  onClick={() => onSelect({
                    id: group.id,
                    code: group.code,
                    name: group.name,
                    owner: group.owner,
                    representative_company: null,
                    affiliate_count: group.affiliate_count,
                    group_type: null,
                    is_public: false,
                  })}
                  className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 cursor-pointer transition-all"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-lg text-gray-900">{group.name}</h3>
                      {group.owner && (
                        <p className="text-sm text-gray-500 mt-1">동일인: {group.owner}</p>
                      )}
                    </div>
                    <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">
                      {group.affiliate_count}개사
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 계열사 결과 */}
        {searchData.affiliates.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-700 mb-3">계열사</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {searchData.affiliates.map((affiliate) => (
                <div
                  key={affiliate.id}
                  onClick={() => handleAffiliateClick(affiliate.group_code, affiliate.group_name)}
                  className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-green-300 cursor-pointer transition-all"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-gray-900">{affiliate.name}</h3>
                      {affiliate.ceo && (
                        <p className="text-sm text-gray-500 mt-1">대표: {affiliate.ceo}</p>
                      )}
                    </div>
                    <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded">
                      계열사
                    </span>
                  </div>
                  {affiliate.group_name && (
                    <p className="text-sm text-gray-600 mt-2">
                      소속: {affiliate.group_name}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {searchData.total === 0 && (
          <div className="text-center text-gray-500 py-12">
            검색 결과가 없습니다
          </div>
        )}
      </>
    )
  }

  // 기본 목록 렌더링
  const renderGroupList = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500">로딩 중...</div>
        </div>
      )
    }

    return (
      <>
        {/* 결과 정보 */}
        <div className="mb-4 text-sm text-gray-500">
          총 {groupsData?.total ?? 0}개 기업집단
        </div>

        {/* 기업집단 목록 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groupsData?.items.map((group) => (
            <div
              key={group.id}
              onClick={() => onSelect(group)}
              className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 cursor-pointer transition-all"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg text-gray-900">
                    {group.name}
                  </h3>
                  {group.owner && (
                    <p className="text-sm text-gray-500 mt-1">
                      동일인: {group.owner}
                    </p>
                  )}
                </div>
                <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">
                  {group.affiliate_count}개사
                </span>
              </div>

              {group.representative_company && (
                <p className="text-sm text-gray-600 mt-2">
                  대표회사: {group.representative_company}
                </p>
              )}

              {group.group_type && (
                <span className="inline-block mt-2 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                  {group.group_type}
                </span>
              )}
            </div>
          ))}
        </div>

        {groupsData?.items.length === 0 && (
          <div className="text-center text-gray-500 py-12">
            데이터가 없습니다. 동기화를 실행해주세요.
          </div>
        )}
      </>
    )
  }

  return (
    <div>
      {/* 검색 - 항상 표시 */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="기업집단 또는 계열사 검색..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* 검색 모드 또는 목록 모드 */}
      {keyword ? renderSearchResults() : renderGroupList()}
    </div>
  )
}
