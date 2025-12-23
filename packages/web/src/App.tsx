import { useState, useEffect } from 'react'
import { GroupList } from './components/GroupList'
import { CollapsibleTree } from './components/CollapsibleTree'
import { initializeAdMob, showBannerAd } from './services/ad-service'
import type { CorporateGroup } from './types'

function App() {
  const [selectedGroup, setSelectedGroup] = useState<CorporateGroup | null>(null)

  // AdMob 초기화 및 배너 광고 표시
  useEffect(() => {
    const initAds = async () => {
      await initializeAdMob()
      await showBannerAd()
    }
    initAds()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 pb-14">
      <main className="max-w-7xl mx-auto px-4 py-4 md:py-6">
        {selectedGroup ? (
          <CollapsibleTree
            groupCode={selectedGroup.code}
            onBack={() => setSelectedGroup(null)}
          />
        ) : (
          <GroupList onSelect={setSelectedGroup} />
        )}
      </main>
    </div>
  )
}

export default App
