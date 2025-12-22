import { useMemo, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useAffiliates } from '../hooks/useAffiliates'
import type { CorporateGroup, Affiliate } from '../types'

interface Props {
  group: CorporateGroup
}

function createNodesAndEdges(
  group: CorporateGroup,
  affiliates: Affiliate[]
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  // 중앙에 대표회사 또는 그룹명 노드
  const centerNode: Node = {
    id: 'center',
    type: 'default',
    position: { x: 400, y: 300 },
    data: {
      label: group.representative_company || group.name,
    },
    style: {
      background: '#3b82f6',
      color: 'white',
      border: '2px solid #1d4ed8',
      borderRadius: '8px',
      padding: '10px 20px',
      fontWeight: 'bold',
      fontSize: '14px',
      width: 'auto',
    },
  }
  nodes.push(centerNode)

  // 계열사들을 원형으로 배치
  const radius = 250
  const centerX = 400
  const centerY = 300

  affiliates.forEach((affiliate, index) => {
    const angle = (2 * Math.PI * index) / affiliates.length - Math.PI / 2
    const x = centerX + radius * Math.cos(angle)
    const y = centerY + radius * Math.sin(angle)

    const node: Node = {
      id: `affiliate-${affiliate.id}`,
      type: 'default',
      position: { x, y },
      data: {
        label: affiliate.name.replace(/\(주\)|\(유\)/g, '').trim(),
      },
      style: {
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '6px',
        padding: '8px 12px',
        fontSize: '12px',
        width: 'auto',
        maxWidth: '150px',
        textAlign: 'center' as const,
      },
    }
    nodes.push(node)

    const edge: Edge = {
      id: `edge-${affiliate.id}`,
      source: 'center',
      target: `affiliate-${affiliate.id}`,
      style: { stroke: '#94a3b8' },
    }
    edges.push(edge)
  })

  return { nodes, edges }
}

export function AffiliateGraph({ group }: Props) {
  const { data, isLoading, error } = useAffiliates(group.code)

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!data?.items) {
      return { initialNodes: [], initialEdges: [] }
    }
    const { nodes, edges } = createNodesAndEdges(group, data.items)
    return { initialNodes: nodes, initialEdges: edges }
  }, [group, data])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // 데이터가 변경되면 노드/엣지 업데이트
  useMemo(() => {
    if (initialNodes.length > 0) {
      setNodes(initialNodes)
      setEdges(initialEdges)
    }
  }, [initialNodes, initialEdges, setNodes, setEdges])

  const onInit = useCallback(() => {
    // 초기화 시 필요한 작업
  }, [])

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="text-gray-500">계열사 정보 로딩 중...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-600 p-4 rounded-lg">
        계열사 정보를 불러오는데 실패했습니다.
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      {/* 헤더 */}
      <div className="p-4 border-b">
        <h2 className="text-xl font-bold text-gray-900">{group.name}</h2>
        <div className="flex gap-4 mt-2 text-sm text-gray-500">
          <span>계열사 {data?.total ?? 0}개</span>
          {group.owner && <span>동일인: {group.owner}</span>}
        </div>
      </div>

      {/* 그래프 */}
      <div className="h-[600px]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onInit={onInit}
          fitView
          attributionPosition="bottom-left"
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </div>
  )
}
