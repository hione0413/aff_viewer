import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchGroups, searchAll, fetchMetadata } from '../services/sqlite-service'
import type { CorporateGroup } from '../types'
import { LegalModal } from './LegalModal'

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
    staleTime: 1000 * 60 * 60,
  })

  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: ['search', keyword],
    queryFn: () => searchAll(keyword),
    enabled: keyword.length > 0,
    staleTime: 1000 * 60 * 5,
  })

  const { data: metadata } = useQuery({
    queryKey: ['metadata'],
    queryFn: () => fetchMetadata(),
    staleTime: Infinity,
  })

  // 모달 상태
  const [legalModal, setLegalModal] = useState<{ type: 'tos' | 'privacy' | null; isOpen: boolean }>({
    type: null,
    isOpen: false
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
          {groupsData?.items.map((group, index) => (
            <div
              key={group.code}
              onClick={() => onSelect({
                id: index,
                code: group.code,
                name: group.name,
                owner: group.owner,
                representative_company: group.representative_company,
                affiliate_count: group.affiliate_count,
                group_type: group.group_type,
                is_public: group.is_public,
              })}
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

  const TOS_CONTENT = `# 서비스 이용약관 (Terms of Service)

본 약관은 **기업족보** 앱(이하 '앱')이 제공하는 서비스의 이용 조건 및 절차, 이용자와 앱 운영자 간의 권리, 의무 및 책임 사항을 규정함을 목적으로 합니다.

## 제1조 (서비스의 목적 및 내용)
1. 본 앱은 공정거래위원회의 공공데이터를 기반으로 기업집단의 계열사 관계를 시각화하여 정보 참고용으로 제공하는 서비스입니다.
2. 본 앱은 단순 정보 제공 서비스이며, 어떠한 형태의 투자 권유나 법적 자문을 제공하지 않습니다.

## 제2조 (데이터의 정확성 및 면책)
1. 본 앱이 제공하는 데이터는 공정거래위원회 기업집단포털의 공시 자료를 원천으로 합니다.
2. **데이터의 실시간성 보장 불가**: 앱 내 데이터는 실시간으로 갱신되지 않으며, 공시 시점과 앱 반영 시점 사이에 차이가 발생할 수 있습니다.
3. **정보의 완전성 및 정확성**: 데이터 동기화 과정에서의 기술적 오류, 원천 데이터의 변경 등으로 인해 실제 기업 현황과 다를 수 있습니다. 이용자는 중요한 결정을 내리기 전 반드시 금융감독원 전자공시시스템(DART) 또는 각 기업의 공식 공시를 통해 정보를 재확인해야 합니다.
4. **책임의 제한**: 앱 운영자는 본 앱이 제공하는 정보의 오류, 누락, 지연 등으로 인해 이용자에게 발생하는 직접적, 간접적, 부수적, 징벌적 손해(투자 손실, 사업 중단, 정보 유실 등 포함)에 대하여 법적 책임을 지지 않습니다.

## 제3조 (서비스 이용의 제한)
1. 서비스는 운영자의 사정에 따라 사전 고지 없이 변경되거나 중단될 수 있습니다.
2. 이용자는 본 서비스를 불법적인 목적이나 타인의 명예를 훼손하는 용도로 사용할 수 없습니다.

## 제4조 (저작권 및 상표권)
1. 앱 내 디자인, 로직, UI/UX에 대한 저작권은 운영자에게 있습니다.
2. 앱 내 표시되는 기업명, 로고 등은 각 해당 기업의 상표권 및 저작권에 속하며, 앱은 이를 정보 제공 목적으로만 인용합니다.

## 제5조 (약관의 변경)
운영자는 관련 법령을 위배하지 않는 범위에서 본 약관을 개정할 수 있으며, 개정 시 앱 내 또는 스토어를 통해 공지합니다. 이용자가 개정된 약관에 동의하지 않을 경우 앱을 삭제함으로써 이용 계약을 해지할 수 있습니다.

## 제6조 (준거법 및 관할)
본 약관과 관련하여 발생한 분쟁에 대해서는 대한민국 법을 준거법으로 하며, 관할 법원은 관련 법령에 따른 법원으로 합니다.

**시행일**: 2026년 1월 2일`

  const PRIVACY_CONTENT = `# 개인정보처리방침 (Privacy Policy)

**기업족보** 앱(이하 '앱')은 사용자의 개인정보를 소중히 다루며, 관련 법령(개인정보 보호법 등)을 준수하기 위해 다음과 같은 개인정보처리방침을 수립하여 공개합니다.

## 1. 개인정보의 수집 및 이용 목적
본 앱은 사용자의 특정 개인정보를 직접적으로 수집하여 저장하거나 이용하지 않습니다. 오직 서비스 제공을 위한 데이터 조회 및 광고 송출 목적으로만 관련 정보를 활용합니다.

## 2. 수집하는 개인정보 항목
- **직접 수집 정보**: 본 앱은 회원가입 절차가 없으며, 사용자를 식별할 수 있는 이름, 이메일, 전화번호 등을 **직접 수집하지 않습니다.**
- **데이터 활용**: 앱에서 표시되는 기업인(대표자 등)의 성명은 공정거래위원회 기업집단포털을 통해 공개된 **공공데이터**를 기반으로 하며, 공익적 정보 제공 목적으로만 활용됩니다.

## 3. 제3자 서비스 및 데이터 수집 (광고)
본 앱은 무료 서비스 제공 및 광고 게재를 위해 **Google AdMob**을 이용합니다. 이 과정에서 Google에 의해 다음과 같은 정보가 자동 수집될 수 있습니다:
- **기기 식별자**: 광고 ID (AD ID), 기기 모델명, OS 버전, IP 주소
- **사용 기록**: 광고 노출, 클릭 데이터 및 앱 내 상호작용 정보
- **관련 링크**: https://policies.google.com/privacy

## 4. 앱 권한 사용 안내
서비스 제공을 위해 아래와 같은 필수 권한을 사용합니다:
- **인터넷 접속 (INTERNET)**: 최신 기업 데이터 조회 및 광고 송출을 위해 필요합니다.

## 5. 아동의 개인정보 보호
본 앱은 만 13세 미만 아동의 개인정보를 의도적으로 수집하지 않습니다. 만약 아동의 정보가 수집되었음을 인지할 경우 즉시 삭제 조치합니다.

## 6. 개인정보의 보유 및 이용기간
본 앱은 직접 개인정보를 저장하지 않으므로 보유하는 데이터가 없습니다. AdMob 등 제3자 서비스에서 수집된 정보의 보유 기간은 해당사의 정책을 따릅니다.

## 7. 정보주체의 권리와 행사방법
사용자는 언제든지 기기의 설정(광고 ID 재설정 등)을 통해 정보 수집을 거부할 수 있습니다. 또한, 앱 내 표시된 공공데이터의 오류나 수정이 필요한 경우 아래 연락처로 요청하실 수 있습니다.

## 8. 개인정보 보호책임자 및 문의
앱 이용 중 궁금하신 점이나 정보 수정 요청은 아래의 연락처로 문의해 주시기 바랍니다.
- **이메일**: [사용자님의 이메일을 여기에 적어주세요]

## 9. 정책 변경 공지
본 방침은 법령 또는 서비스 변경에 따라 내용이 수정될 수 있습니다. 중요한 변경사항이 있을 경우 스토어 또는 앱 내 공지사항을 통해 고지합니다.

**최종 수정일**: 2026년 1월 2일`

  return (
    <div>
      {/* 타이틀 */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
          기업족보
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          대한민국 대규모기업집단 계열사 관계도
        </p>
      </div>

      {/* 검색 */}
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

      {/* 데이터 출처 정보 */}
      <div className="mt-12 py-6 border-t border-gray-200 text-center">
        <p className="text-xs text-gray-400">
          데이터 기준: {metadata?.designationYear ? `${metadata.designationYear.substring(0, 4)}년 ${metadata.designationYear.substring(4, 6)}월` : '확인 중...'}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          출처: 공정거래위원회 기업집단포털 (OPENDATA)
        </p>
        <p className="text-[10px] text-gray-300 mt-2 leading-relaxed px-4">
          본 서비스의 데이터는 공정거래위원회 공시 자료를 바탕으로 제공되나, 실시간 데이터가 아니며 실제 기업 상황과 다를 수 있습니다. 정확한 최신 정보는 각 기업의 공시를 통해 확인하시기 바랍니다.
        </p>

        <div className="mt-4 flex justify-center gap-4 text-[10px] text-gray-400">
          <button
            onClick={() => setLegalModal({ type: 'tos', isOpen: true })}
            className="hover:text-gray-600 underline"
          >
            이용약관
          </button>
          <span className="text-gray-200">|</span>
          <button
            onClick={() => setLegalModal({ type: 'privacy', isOpen: true })}
            className="hover:text-gray-600 underline font-medium"
          >
            개인정보처리방침
          </button>
        </div>
      </div>

      <LegalModal
        title={legalModal.type === 'tos' ? '이용약관' : '개인정보처리방침'}
        content={legalModal.type === 'tos' ? TOS_CONTENT : PRIVACY_CONTENT}
        isOpen={legalModal.isOpen}
        onClose={() => setLegalModal({ ...legalModal, isOpen: false })}
      />
    </div>
  )
}
