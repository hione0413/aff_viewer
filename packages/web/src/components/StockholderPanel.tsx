import { useQuery } from '@tanstack/react-query'
import { fetchStockholders, type StockholderInfo } from '../services/sqlite-service'
import { useState } from 'react'

interface Props {
  corpNumber: string
  companyName: string
  onClose: () => void
}

export function StockholderPanel({ corpNumber, companyName, onClose }: Props) {
  const [hideIndividuals, setHideIndividuals] = useState(true)

  const { data, isLoading, error } = useQuery({
    queryKey: ['stockholders', corpNumber, hideIndividuals],
    queryFn: () => fetchStockholders(corpNumber, hideIndividuals),
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="p-4 border-b bg-gray-50">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">{companyName}</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-xl"
            >
              ×
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-1">주주현황</p>
        </div>

        {/* 옵션 */}
        <div className="p-3 border-b bg-gray-50">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={hideIndividuals}
              onChange={(e) => setHideIndividuals(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span>개인 주주 숨김 (법인만 표시)</span>
          </label>
        </div>

        {/* 내용 */}
        <div className="p-4 overflow-y-auto max-h-[50vh]">
          {isLoading ? (
            <div className="text-center text-gray-500 py-8">로딩 중...</div>
          ) : error ? (
            <div className="text-center text-gray-500 py-8">
              {error instanceof Error ? error.message : '주주현황 정보가 없습니다'}
            </div>
          ) : data ? (
            <>
              {/* 통계 */}
              <div className="grid grid-cols-3 gap-2 mb-4 text-sm">
                <div className="bg-blue-50 p-2 rounded text-center">
                  <div className="text-blue-800 font-bold">{data.corporate_count}</div>
                  <div className="text-blue-600 text-xs">법인 주주</div>
                </div>
                <div className="bg-green-50 p-2 rounded text-center">
                  <div className="text-green-800 font-bold">{data.individual_count}</div>
                  <div className="text-green-600 text-xs">개인 주주</div>
                </div>
                <div className="bg-purple-50 p-2 rounded text-center">
                  <div className="text-purple-800 font-bold">{data.individual_total_rate}%</div>
                  <div className="text-purple-600 text-xs">개인 합산</div>
                </div>
              </div>

              {/* 주주 목록 */}
              <div className="space-y-2">
                {data.stockholders.map((s, i) => (
                  <StockholderRow key={i} stockholder={s} />
                ))}
              </div>

              {data.stockholders.length === 0 && (
                <div className="text-center text-gray-500 py-4">
                  표시할 주주가 없습니다
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* 푸터 */}
        <div className="p-3 border-t bg-gray-50 text-xs text-gray-500 space-y-1">
          <p className="text-gray-400">
            ※ 트리의 지분율은 지주회사의 직접 보유 지분이며, 이 목록은 해당 회사의 전체 주주현황입니다. 데이터 기준일에 따라 차이가 있을 수 있습니다.
          </p>
          <p>법인등록번호: {corpNumber}</p>
        </div>
      </div>
    </div>
  )
}

// 개인 이름 마스킹 (홍길동 → 홍**)
function maskName(name: string): string {
  if (!name || name.length <= 1) return name
  return name[0] + '*'.repeat(name.length - 1)
}

function StockholderRow({ stockholder }: { stockholder: StockholderInfo }) {
  const bgColor = stockholder.is_corporate ? 'bg-blue-50' : 'bg-gray-50'
  const textColor = stockholder.is_corporate ? 'text-blue-800' : 'text-gray-600'

  // 개인 주주는 이름 마스킹
  const displayName = stockholder.is_corporate
    ? stockholder.stockholder_name
    : maskName(stockholder.stockholder_name)

  return (
    <div className={`${bgColor} p-3 rounded flex items-center justify-between`}>
      <div>
        <div className={`font-medium ${textColor}`}>
          {displayName}
        </div>
        <div className="text-xs text-gray-500">
          {stockholder.is_corporate ? '법인' : '개인'}
          {stockholder.stockholder_type && ` · ${stockholder.stockholder_type}`}
        </div>
      </div>
      <div className="text-right">
        <div className={`font-bold ${textColor}`}>
          {stockholder.total_rate?.toFixed(2)}%
        </div>
        {(stockholder.common_rate !== stockholder.total_rate) && (
          <div className="text-xs text-gray-500">
            보통 {stockholder.common_rate?.toFixed(2)}%
          </div>
        )}
      </div>
    </div>
  )
}
