import { useMemo, useEffect, useState } from 'react'
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
import { fetchIntegratedGroup, type CompanyNode } from '../services/api'

interface Props {
  groupCode: string
  onBack: () => void
}

// 소스별 스타일
const sourceStyles = {
  holding: { bg: '#3b82f6', border: '#2563eb' },  // 파란색 - 지주구조
  affiliate: { bg: '#10b981', border: '#059669' }, // 녹색 - 계열사만
  both: { bg: '#8b5cf6', border: '#7c3aed' },      // 보라색 - 둘 다
}

// 레벨별 스타일 (지주회사 구조용)
const levelStyles = [
  { fontSize: '14px', padding: '12px 24px' }, // 지주회사
  { fontSize: '12px', padding: '8px 16px' },  // 자회사
  { fontSize: '11px', padding: '6px 12px' },  // 손자회사
  { fontSize: '10px', padding: '4px 10px' },  // 증손자회사
]

function getStyle(level: number, source: string) {
  const levelStyle = levelStyles[Math.min(level, levelStyles.length - 1)]
  const sourceStyle = sourceStyles[source as keyof typeof sourceStyles] || sourceStyles.holding
  return { ...levelStyle, ...sourceStyle }
}

// 트리 너비 계산
function calculateSubtreeWidth(node: CompanyNode, spacing: number): number {
  if (node.children.length === 0) return spacing
  return node.children.reduce((sum, child) => sum + calculateSubtreeWidth(child, spacing), 0)
}

function createNodesAndEdges(
  groupName: string,
  holdingCorpNumber: string | null,
  tree: CompanyNode[],
  otherAffiliates: CompanyNode[],
  showHolding: boolean,
  showOthers: boolean,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  const spacing = 180
  const levelHeight = 120

  if (showHolding && tree.length > 0 && holdingCorpNumber) {
    // 전체 트리 너비 계산
    const totalWidth = tree.reduce((sum, child) => sum + calculateSubtreeWidth(child, spacing), 0)
    const startX = Math.max(400, totalWidth / 2)

    // 지주회사 노드
    const style = getStyle(0, 'holding')
    nodes.push({
      id: holdingCorpNumber,
      type: 'default',
      position: { x: startX, y: 50 },
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

    // 재귀적으로 노드 추가
    function addNodes(
      children: CompanyNode[],
      parentId: string,
      level: number,
      offsetX: number,
      y: number
    ) {
      let currentX = offsetX

      children.forEach((child) => {
        const subtreeWidth = calculateSubtreeWidth(child, spacing)
        const x = currentX + subtreeWidth / 2
        const style = getStyle(level, child.source)

        nodes.push({
          id: child.corp_number,
          type: 'default',
          position: { x, y },
          data: {
            label: `${child.name}${child.ownership_rate ? `\n(${child.ownership_rate}%)` : ''}`,
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

        edges.push({
          id: `${parentId}-${child.corp_number}`,
          source: parentId,
          target: child.corp_number,
          label: child.ownership_rate ? `${child.ownership_rate}%` : '',
          style: { stroke: style.bg, strokeWidth: Math.max(1, 3 - level) },
          labelStyle: { fontSize: Math.max(8, 11 - level), fill: '#666' },
        })

        if (child.children.length > 0) {
          addNodes(child.children, child.corp_number, level + 1, currentX, y + levelHeight)
        }

        currentX += subtreeWidth
      })
    }

    const treeStartX = startX - totalWidth / 2
    addNodes(tree, holdingCorpNumber, 1, treeStartX, 50 + levelHeight)
  }

  // 기타 계열사 (지주구조 외) - 지주회사에 점선으로 연결
  if (showOthers && otherAffiliates.length > 0) {
    // 트리 높이 계산 (재귀적으로 최대 깊이 찾기)
    function getTreeDepth(nodes: CompanyNode[]): number {
      if (nodes.length === 0) return 0
      return 1 + Math.max(...nodes.map(n => getTreeDepth(n.children)))
    }
    const treeDepth = showHolding && tree.length > 0 ? getTreeDepth(tree) : 0
    const otherStartY = 50 + (treeDepth + 1) * levelHeight + 50

    const otherSpacing = 160
    const cols = Math.min(6, otherAffiliates.length)
    const totalOtherWidth = cols * otherSpacing
    const otherStartX = (showHolding && holdingCorpNumber)
      ? Math.max(400, tree.reduce((sum, c) => sum + calculateSubtreeWidth(c, spacing), 0) / 2) - totalOtherWidth / 2
      : 50

    // "기타 계열사" 그룹 노드
    const groupNodeId = 'other-affiliates-group'
    nodes.push({
      id: groupNodeId,
      type: 'default',
      position: { x: otherStartX + totalOtherWidth / 2, y: otherStartY },
      data: { label: `기타 계열사 (${otherAffiliates.length}개)` },
      style: {
        background: '#f3f4f6',
        color: '#374151',
        border: '2px dashed #9ca3af',
        borderRadius: '8px',
        padding: '8px 16px',
        fontSize: '12px',
        fontWeight: 'bold',
      },
    })

    // 지주회사와 기타계열사 그룹 연결 (점선)
    if (showHolding && holdingCorpNumber) {
      edges.push({
        id: `${holdingCorpNumber}-${groupNodeId}`,
        source: holdingCorpNumber,
        target: groupNodeId,
        style: { stroke: '#9ca3af', strokeWidth: 2, strokeDasharray: '5,5' },
        label: '계열사',
        labelStyle: { fontSize: 10, fill: '#666' },
      })
    }

    otherAffiliates.forEach((affiliate, index) => {
      const row = Math.floor(index / cols)
      const col = index % cols
      const x = otherStartX + col * otherSpacing + otherSpacing / 2
      const y = otherStartY + 80 + row * 70

      nodes.push({
        id: affiliate.corp_number,
        type: 'default',
        position: { x, y },
        data: { label: affiliate.name },
        style: {
          background: sourceStyles.affiliate.bg,
          color: 'white',
          border: `1px solid ${sourceStyles.affiliate.border}`,
          borderRadius: '6px',
          padding: '6px 12px',
          fontSize: '10px',
        },
      })

      // 그룹 노드와 연결
      edges.push({
        id: `${groupNodeId}-${affiliate.corp_number}`,
        source: groupNodeId,
        target: affiliate.corp_number,
        style: { stroke: sourceStyles.affiliate.bg, strokeWidth: 1 },
      })
    })
  }

  return { nodes, edges }
}

export function IntegratedGraph({ groupCode, onBack }: Props) {
  const [showHolding, setShowHolding] = useState(true)
  const [showOthers, setShowOthers] = useState(true)

  const { data, isLoading, error } = useQuery({
    queryKey: ['integratedGroup', groupCode],
    queryFn: () => fetchIntegratedGroup(groupCode),
  })

  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    if (!data) {
      return { nodes: [], edges: [] }
    }
    return createNodesAndEdges(
      data.holding_company || data.group_name,
      data.holding_corp_number,
      data.tree,
      data.other_affiliates,
      showHolding,
      showOthers
    )
  }, [data, showHolding, showOthers])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialNodes, initialEdges, setNodes, setEdges])

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="text-gray-500">로딩 중...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-600 p-4 rounded-lg">
        정보를 불러오는데 실패했습니다.
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      {/* 헤더 */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <div>
            <button
              onClick={onBack}
              className="text-gray-600 hover:text-gray-900 mr-4"
            >
              ← 목록
            </button>
            <span className="text-xl font-bold text-gray-900">
              {data.group_name}
            </span>
            {data.owner && (
              <span className="ml-2 text-sm text-gray-500">
                (동일인: {data.owner})
              </span>
            )}
          </div>
        </div>

        {/* 통계 */}
        <div className="flex gap-4 text-sm mb-4">
          <span className="bg-gray-100 px-3 py-1 rounded">
            전체 계열사: {data.stats.total_affiliates}개
          </span>
          {data.holding_company && (
            <>
              <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded">
                지주구조: {data.stats.in_holding_structure}개
              </span>
              <span className="bg-green-100 text-green-800 px-3 py-1 rounded">
                기타 계열사: {data.stats.other_affiliates}개
              </span>
            </>
          )}
        </div>

        {/* 필터 토글 */}
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showHolding}
              onChange={(e) => setShowHolding(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="text-sm">지주회사 구조</span>
            <span className="w-3 h-3 rounded" style={{ background: sourceStyles.holding.bg }}></span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showOthers}
              onChange={(e) => setShowOthers(e.target.checked)}
              className="w-4 h-4 text-green-600 rounded"
            />
            <span className="text-sm">기타 계열사</span>
            <span className="w-3 h-3 rounded" style={{ background: sourceStyles.affiliate.bg }}></span>
          </label>
        </div>
      </div>

      {/* 그래프 */}
      <div className="h-[600px]">
        {nodes.length > 0 ? (
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
        ) : (
          <div className="flex justify-center items-center h-full text-gray-500">
            표시할 데이터를 선택해주세요
          </div>
        )}
      </div>

      {/* 범례 */}
      <div className="p-4 border-t flex flex-wrap gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ background: sourceStyles.holding.bg }}></div>
          <span>지주회사 구조 (지분율 명시)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ background: sourceStyles.affiliate.bg }}></div>
          <span>기타 계열사 (지분관계 미상)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ background: sourceStyles.both.bg }}></div>
          <span>지주구조 + 계열사</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 border-t-2 border-dashed border-gray-400"></div>
          <span>계열 관계 (소유구조 불명)</span>
        </div>
      </div>
    </div>
  )
}
