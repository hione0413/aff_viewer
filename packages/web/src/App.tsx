import { useState, useEffect } from 'react'
import { GroupList } from './components/GroupList'
import { CollapsibleTree } from './components/CollapsibleTree'
import { initializeAdMob, showBannerAd } from './services/ad-service'
import type { CorporateGroup } from './types'

function App() {
  const [selectedGroup, setSelectedGroup] = useState<CorporateGroup | null>(null)
  const [adHeight, setAdHeight] = useState(0)

  // AdMob 초기화 및 배너 광고 표시
  useEffect(() => {
    const initAds = async () => {
      await initializeAdMob()
      await showBannerAd((height) => {
        setAdHeight(height)
      })
    }
    initAds()
  }, [])

  return (
    <div
      className="h-screen w-screen bg-gray-50 flex flex-col overflow-hidden"
      style={{
        paddingTop: 'env(safe-area-inset-top, 24px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* 메인 콘텐츠 영역 (광고 제외한 나머지 공간 다 사용) */}
      <main className="flex-1 relative flex flex-col overflow-hidden">
        {selectedGroup ? (
          <CollapsibleTree
            groupCode={selectedGroup.code}
            onBack={() => setSelectedGroup(null)}
          />
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-4 md:py-6">
            <div className="max-w-7xl mx-auto">
              <GroupList onSelect={setSelectedGroup} />
            </div>
          </div>
        )}
      </main>

      {/* 광고 영역 홀더: 실제 광고 높이에 맞춰 동적으로 조절 */}
      <div
        className="w-full bg-white border-t border-gray-100 shrink-0 z-50 transition-[height] duration-300 ease-in-out"
        style={{ height: adHeight > 0 ? `${adHeight}px` : '0px' }}
      />
    </div>
  )
}

export default App
