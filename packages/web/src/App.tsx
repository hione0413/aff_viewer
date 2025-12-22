import { useState } from 'react'
import { GroupList } from './components/GroupList'
import { CollapsibleTree } from './components/CollapsibleTree'
import type { CorporateGroup } from './types'

function App() {
  const [selectedGroup, setSelectedGroup] = useState<CorporateGroup | null>(null)

  return (
    <div className="min-h-screen bg-gray-50">
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
