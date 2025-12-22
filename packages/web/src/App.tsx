import { useState } from 'react'
import { GroupList } from './components/GroupList'
import { CollapsibleTree } from './components/CollapsibleTree'
import { triggerSync, syncHoldingRelations } from './services/api'
import type { CorporateGroup } from './types'

function App() {
  const [selectedGroup, setSelectedGroup] = useState<CorporateGroup | null>(null)
  const [syncing, setSyncing] = useState(false)

  const handleSync = async () => {
    setSyncing(true)
    try {
      // 기업집단 + 지주회사 데이터 동시 동기화
      await Promise.all([
        triggerSync(),
        syncHoldingRelations(),
      ])
      window.location.reload()
    } catch (e) {
      console.error(e)
      alert('동기화에 실패했습니다.')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                기업 계열사 시각화
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                대한민국 대규모기업집단 계열사 관계도
              </p>
            </div>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-400"
            >
              {syncing ? '동기화 중...' : '데이터 동기화'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
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
