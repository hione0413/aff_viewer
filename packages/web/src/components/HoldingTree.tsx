import { useMemo, useEffect } from 'react'
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
import { useQuery } from '@tanstack/react-query'
import { fetchHoldingTree, type HoldingTreeNode } from '../services/api'

interface Props {
  corpNumber: string
  onBack: () => void
}

// 레벨별 스타일 정의
const levelStyles = [
  { bg: '#1e40af', border: '#1e3a8a', stroke: '#1e40af', fontSize: '14px', padding: '12px 24px' }, // 지주회사
  { bg: '#3b82f6', border: '#2563eb', stroke: '#3b82f6', fontSize: '12px', padding: '8px 16px' },  // 자회사
  { bg: '#60a5fa', border: '#3b82f6', stroke: '#60a5fa', fontSize: '11px', padding: '6px 12px' },  // 손자회사
  { bg: '#93c5fd', border: '#60a5fa', stroke: '#93c5fd', fontSize: '10px', padding: '4px 10px' },  // 증손자회사
]

function getStyle(level: number) {
  return levelStyles[Math.min(level, levelStyles.length - 1)]
}

// 트리의 각 노드별 너비 계산 (자식 수 기반)
function calculateSubtreeWidth(node: HoldingTreeNode, spacing: number): number {
  if (node.children.length === 0) return spacing
  return node.children.reduce((sum, child) => sum + calculateSubtreeWidth(child, spacing), 0)
}

function createNodesAndEdges(
  groupName: string,
  corpNumber: string,
  tree: HoldingTreeNode[]
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  const spacing = 180
  const levelHeight = 120

  // 전체 트리 너비 계산
  const totalWidth = tree.reduce((sum, child) => sum + calculateSubtreeWidth(child, spacing), 0)
  const startX = 400 - totalWidth / 2

  // 지주회사 노드 (최상위)
  const style = getStyle(0)
  nodes.push({
    id: corpNumber,
    type: 'default',
    position: { x: 400, y: 50 },
    data: { label: groupName },
    style: {
      background: style.bg,
      color: 'white',
      border: `2px solid ${style.border}`,
      borderRadius: '8px',
      padding: style.padding,
      fontWeight: 'bold',
      fontSize: style.fontSize,
    },
  })

  // 재귀적으로 노드와 엣지 추가
  function addNodes(
    children: HoldingTreeNode[],
    parentId: string,
    level: number,
    offsetX: number,
    y: number
  ) {
    let currentX = offsetX

    children.forEach((child) => {
      const subtreeWidth = calculateSubtreeWidth(child, spacing)
      const x = currentX + subtreeWidth / 2
      const style = getStyle(level)

      // 노드 추가
      nodes.push({
        id: child.corp_number,
        type: 'default',
        position: { x, y },
        data: {
          label: `${child.name}\n(${child.ownership_rate}%)`,
        },
        style: {
          background: style.bg,
          color: 'white',
          border: `1px solid ${style.border}`,
          borderRadius: '6px',
          padding: style.padding,
          fontSize: style.fontSize,
          textAlign: 'center' as const,
          whiteSpace: 'pre-wrap' as const,
        },
      })

      // 엣지 추가
      edges.push({
        id: `${parentId}-${child.corp_number}`,
        source: parentId,
        target: child.corp_number,
        label: `${child.ownership_rate}%`,
        style: { stroke: style.stroke, strokeWidth: Math.max(1, 3 - level) },
        labelStyle: { fontSize: Math.max(8, 11 - level), fill: '#666' },
      })

      // 자식이 있으면 재귀 호출
      if (child.children.length > 0) {
        addNodes(child.children, child.corp_number, level + 1, currentX, y + levelHeight)
      }

      currentX += subtreeWidth
    })
  }

  // 1레벨(자회사)부터 시작
  addNodes(tree, corpNumber, 1, startX, 50 + levelHeight)

  return { nodes, edges }
}

export function HoldingTree({ corpNumber, onBack }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['holdingTree', corpNumber],
    queryFn: () => fetchHoldingTree(corpNumber),
  })

  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    if (!data?.tree) {
      return { nodes: [], edges: [] }
    }
    const result = createNodesAndEdges(data.holding_group_name, corpNumber, data.tree)
    console.log('Tree data:', data.tree)
    console.log('Created nodes:', result.nodes.length, 'edges:', result.edges.length)
    return result
  }, [data, corpNumber])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  useEffect(() => {
    if (initialNodes.length > 0) {
      setNodes(initialNodes)
      setEdges(initialEdges)
    }
  }, [initialNodes, initialEdges, setNodes, setEdges])

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="text-gray-500">지주회사 구조 로딩 중...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-600 p-4 rounded-lg">
        지주회사 정보를 불러오는데 실패했습니다.
      </div>
    )
  }

  if (!data?.tree.length) {
    return (
      <div className="bg-yellow-50 text-yellow-600 p-4 rounded-lg">
        이 지주회사의 자회사/손자회사 정보가 없습니다.
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      {/* 헤더 */}
      <div className="p-4 border-b flex items-center justify-between">
        <div>
          <button
            onClick={onBack}
            className="text-gray-600 hover:text-gray-900 mr-4"
          >
            ← 목록
          </button>
          <span className="text-xl font-bold text-gray-900">
            {data?.holding_group_name}
          </span>
          {data?.finance_type && (
            <span className="ml-2 text-sm text-gray-500">
              ({data.finance_type})
            </span>
          )}
        </div>
        <div className="text-sm text-gray-500">
          자회사 {data?.tree.length}개
        </div>
      </div>

      {/* 그래프 */}
      <div className="h-[600px]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          attributionPosition="bottom-left"
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>

      {/* 범례 */}
      <div className="p-4 border-t flex flex-wrap gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-[#1e40af] rounded"></div>
          <span>지주회사</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-[#3b82f6] rounded"></div>
          <span>자회사</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-[#60a5fa] rounded"></div>
          <span>손자회사</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-[#93c5fd] rounded"></div>
          <span>증손자회사</span>
        </div>
      </div>
    </div>
  )
}
