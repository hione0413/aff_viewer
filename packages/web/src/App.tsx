import { useState } from 'react'
import { GroupList } from './components/GroupList'
import { CollapsibleTree } from './components/CollapsibleTree'
import type { CorporateGroup } from './types'

function App() {
  const [selectedGroup, setSelectedGroup] = useState<CorporateGroup | null>(null)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">
            기업 계열사 시각화
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            대한민국 대규모기업집단 계열사 관계도
          </p>
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
