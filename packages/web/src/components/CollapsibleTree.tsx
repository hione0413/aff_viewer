import { useState, useCallback, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useQuery } from '@tanstack/react-query'
import { fetchIntegratedGroup, type CompanyNode } from '../services/api'
import { StockholderPanel } from './StockholderPanel'

interface Props {
  groupCode: string
  onBack: () => void
}

// 소스별 스타일
const sourceStyles = {
  holding: { bg: '#3b82f6', border: '#2563eb' },
  affiliate: { bg: '#10b981', border: '#059669' },
  both: { bg: '#8b5cf6', border: '#7c3aed' },
  root: { bg: '#1e40af', border: '#1e3a8a' },
}

// 자식 수 계산 (재귀)
function countAllChildren(node: CompanyNode): number {
  let count = node.children.length
  for (const child of node.children) {
    count += countAllChildren(child)
  }
  return count
}

// 커스텀 노드 컴포넌트
interface CustomNodeData {
  label: string
  childCount: number
  isExpanded: boolean
  hasChildren: boolean
  source: string
  level: number
  ownershipRate?: number | null
  inferred?: boolean  // 주주현황 기반 추론 관계
  onToggle: (nodeId: string) => void
  onShowStockholders: (nodeId: string, label: string) => void
}

function CompanyNodeComponent({ id, data }: NodeProps<Node<CustomNodeData>>) {
  const { label, childCount, isExpanded, hasChildren, source, level, inferred, onToggle, onShowStockholders } = data

  const style = source === 'root'
    ? sourceStyles.root
    : sourceStyles[source as keyof typeof sourceStyles] || sourceStyles.holding

  const fontSize = level === 0 ? '14px' : level === 1 ? '12px' : '11px'
  const padding = level === 0 ? '12px 20px' : level === 1 ? '10px 16px' : '8px 12px'

  // "기타 계열사" 그룹 노드는 주주현황 버튼 숨김
  const showStockholderBtn = id !== 'other-affiliates' && id !== 'group-root'

  // 추론된 관계인 경우 테두리 스타일 변경
  const borderStyle = inferred ? 'dashed' : 'solid'

  return (
    <div
      style={{
        background: style.bg,
        border: `2px ${borderStyle} ${style.border}`,
        borderRadius: '8px',
        padding,
        color: 'white',
        fontSize,
        fontWeight: level === 0 ? 'bold' : 'normal',
        minWidth: '120px',
        textAlign: 'center',
        cursor: hasChildren ? 'pointer' : 'default',
      }}
      onClick={() => hasChildren && onToggle(id)}
    >
      <Handle type="target" position={Position.Left} style={{ visibility: 'hidden' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
        <span>{label}</span>
        {hasChildren && (
          <span
            style={{
              padding: '2px 6px',
              background: 'rgba(255,255,255,0.2)',
              borderRadius: '10px',
              fontSize: '10px',
              whiteSpace: 'nowrap',
            }}
          >
            {isExpanded ? '▼' : '▶'} {childCount}
          </span>
        )}
        {showStockholderBtn && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onShowStockholders(id, label)
            }}
            style={{
              padding: '2px 6px',
              background: 'rgba(255,255,255,0.3)',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              fontSize: '10px',
              cursor: 'pointer',
              marginLeft: '4px',
            }}
            title="주주현황 보기"
          >
            📊
          </button>
        )}
      </div>

      <Handle type="source" position={Position.Right} style={{ visibility: 'hidden' }} />
    </div>
  )
}

// 커스텀 엣지 - 라벨을 target 근처에 배치
function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  label,
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  // 라벨 위치를 target 근처로 (target에서 약간 왼쪽)
  const labelX = targetX - 40
  const labelY = targetY

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              fontSize: 10,
              fontWeight: 500,
              color: '#666',
              background: 'rgba(255,255,255,0.9)',
              padding: '2px 6px',
              borderRadius: 4,
              pointerEvents: 'none',
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const nodeTypes = {
  company: CompanyNodeComponent,
}

const edgeTypes = {
  custom: CustomEdge,
}

// 트리를 노드/엣지로 변환 (수평 레이아웃: 왼쪽→오른쪽)
function buildNodesAndEdges(
  holdingCorpNumber: string | null,
  holdingName: string,
  groupName: string,
  tree: CompanyNode[],
  otherAffiliates: CompanyNode[],
  expandedNodes: Set<string>,
  onToggle: (nodeId: string) => void,
  onShowStockholders: (nodeId: string, label: string) => void,
  showHolding: boolean,
  showOthers: boolean,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  const nodeHeight = 60   // 노드 간 세로 간격
  const levelWidth = 250  // 레벨 간 가로 간격

  // 현재 Y 위치 추적
  let currentY = 50

  // 지주회사가 있는 경우
  const hasHoldingStructure = holdingCorpNumber && tree.length > 0

  if (hasHoldingStructure && showHolding) {
    // 지주회사 노드
    const rootId = holdingCorpNumber
    const totalChildren = tree.reduce((sum, c) => sum + 1 + countAllChildren(c), 0)

    nodes.push({
      id: rootId,
      type: 'company',
      position: { x: 50, y: currentY },
      data: {
        label: holdingName,
        childCount: totalChildren,
        isExpanded: expandedNodes.has(rootId),
        hasChildren: tree.length > 0,
        source: 'root',
        level: 0,
        onToggle,
        onShowStockholders,
      },
    })

    // 재귀적으로 노드 추가 (수평 레이아웃)
    function addNodes(
      children: CompanyNode[],
      parentId: string,
      parentExpanded: boolean,
      level: number,
      x: number
    ): void {
      if (!parentExpanded) return

      children.forEach((child) => {
        const childId = child.corp_number
        const isExpanded = expandedNodes.has(childId)
        const childCount = countAllChildren(child)
        const isInferred = child.inferred === true

        currentY += nodeHeight

        nodes.push({
          id: childId,
          type: 'company',
          position: { x, y: currentY },
          data: {
            label: child.name,
            childCount,
            isExpanded,
            hasChildren: child.children.length > 0,
            source: child.source,
            level,
            ownershipRate: child.ownership_rate,
            inferred: isInferred,
            onToggle,
            onShowStockholders,
          },
        })

        // 추론된 관계는 점선, 기타 계열사는 녹색 유지
        const strokeColor = sourceStyles[child.source as keyof typeof sourceStyles]?.bg || '#3b82f6'
        const edgeStyle = isInferred
          ? { stroke: strokeColor, strokeWidth: 2, strokeDasharray: '5,5' }
          : { stroke: strokeColor, strokeWidth: 2 }

        edges.push({
          id: `${parentId}-${childId}`,
          source: parentId,
          target: childId,
          type: 'custom',
          style: edgeStyle,
          label: child.ownership_rate ? `${child.ownership_rate}%` : undefined,
        })

        // 자식 노드 재귀 처리
        if (isExpanded && child.children.length > 0) {
          addNodes(child.children, childId, true, level + 1, x + levelWidth)
        }
      })
    }

    // 1레벨(자회사)부터 시작
    if (expandedNodes.has(rootId)) {
      addNodes(tree, rootId, true, 1, 50 + levelWidth)
    }

    // 기타 계열사 (지주회사가 있는 경우)
    if (showOthers && otherAffiliates.length > 0) {
      currentY += nodeHeight * 1.5
      const otherGroupId = 'other-affiliates'

      // 기타 계열사 전체 자식 수 계산
      const totalOtherChildren = otherAffiliates.reduce((sum, a) => sum + 1 + countAllChildren(a), 0)

      nodes.push({
        id: otherGroupId,
        type: 'company',
        position: { x: 50 + levelWidth, y: currentY },
        data: {
          label: '기타 계열사',
          childCount: totalOtherChildren,
          isExpanded: expandedNodes.has(otherGroupId),
          hasChildren: true,
          source: 'affiliate',
          level: 1,
          onToggle,
          onShowStockholders,
        },
      })

      edges.push({
        id: `${rootId}-${otherGroupId}`,
        source: rootId,
        target: otherGroupId,
        type: 'smoothstep',
        style: { stroke: '#9ca3af', strokeWidth: 2, strokeDasharray: '5,5' },
      })

      // 기타 계열사 트리 재귀 추가
      function addOtherAffiliateNodes(
        affiliateList: CompanyNode[],
        parentId: string,
        parentExpanded: boolean,
        level: number,
        x: number
      ): void {
        if (!parentExpanded) return

        affiliateList.forEach((affiliate) => {
          const affiliateId = affiliate.corp_number
          const isExpanded = expandedNodes.has(affiliateId)
          const childCount = countAllChildren(affiliate)
          const isInferred = affiliate.inferred === true
          const hasChildren = affiliate.children.length > 0

          currentY += nodeHeight

          nodes.push({
            id: affiliateId,
            type: 'company',
            position: { x, y: currentY },
            data: {
              label: affiliate.name,
              childCount,
              isExpanded,
              hasChildren,
              source: 'affiliate',
              level,
              ownershipRate: affiliate.ownership_rate,
              inferred: isInferred,
              onToggle,
              onShowStockholders,
            },
          })

          // 추론된 관계는 점선
          const edgeStyle = isInferred
            ? { stroke: sourceStyles.affiliate.bg, strokeWidth: 2, strokeDasharray: '5,5' }
            : { stroke: sourceStyles.affiliate.bg, strokeWidth: 1 }

          edges.push({
            id: `${parentId}-${affiliateId}`,
            source: parentId,
            target: affiliateId,
            type: 'custom',
            style: edgeStyle,
            label: affiliate.ownership_rate ? `${affiliate.ownership_rate}%` : undefined,
          })

          // 자식 노드 재귀 처리
          if (isExpanded && hasChildren) {
            addOtherAffiliateNodes(affiliate.children, affiliateId, true, level + 1, x + levelWidth)
          }
        })
      }

      if (expandedNodes.has(otherGroupId)) {
        addOtherAffiliateNodes(otherAffiliates, otherGroupId, true, 2, 50 + levelWidth * 2)
      }
    }
  } else {
    // 지주회사가 없는 경우: 기업집단을 루트로 하고 모든 계열사 표시
    const allAffiliates = [...otherAffiliates]
    if (allAffiliates.length === 0) {
      return { nodes, edges }
    }

    const rootId = 'group-root'

    // 전체 자식 수 계산
    const totalChildren = allAffiliates.reduce((sum, a) => sum + 1 + countAllChildren(a), 0)

    // 기업집단 루트 노드
    nodes.push({
      id: rootId,
      type: 'company',
      position: { x: 50, y: currentY },
      data: {
        label: groupName,
        childCount: totalChildren,
        isExpanded: expandedNodes.has(rootId),
        hasChildren: true,
        source: 'root',
        level: 0,
        onToggle,
        onShowStockholders,
      },
    })

    // 계열사 트리 재귀 추가
    function addAffiliateNodes(
      affiliateList: CompanyNode[],
      parentId: string,
      parentExpanded: boolean,
      level: number,
      x: number
    ): void {
      if (!parentExpanded) return

      affiliateList.forEach((affiliate) => {
        const affiliateId = affiliate.corp_number
        const isExpanded = expandedNodes.has(affiliateId)
        const childCount = countAllChildren(affiliate)
        const isInferred = affiliate.inferred === true
        const hasChildren = affiliate.children.length > 0

        currentY += nodeHeight

        nodes.push({
          id: affiliateId,
          type: 'company',
          position: { x, y: currentY },
          data: {
            label: affiliate.name,
            childCount,
            isExpanded,
            hasChildren,
            source: 'affiliate',
            level,
            ownershipRate: affiliate.ownership_rate,
            inferred: isInferred,
            onToggle,
            onShowStockholders,
          },
        })

        // 추론된 관계는 점선
        const edgeStyle = isInferred
          ? { stroke: sourceStyles.affiliate.bg, strokeWidth: 2, strokeDasharray: '5,5' }
          : { stroke: sourceStyles.affiliate.bg, strokeWidth: 1 }

        edges.push({
          id: `${parentId}-${affiliateId}`,
          source: parentId,
          target: affiliateId,
          type: 'custom',
          style: edgeStyle,
          label: affiliate.ownership_rate ? `${affiliate.ownership_rate}%` : undefined,
        })

        // 자식 노드 재귀 처리
        if (isExpanded && hasChildren) {
          addAffiliateNodes(affiliate.children, affiliateId, true, level + 1, x + levelWidth)
        }
      })
    }

    // 계열사 표시
    if (expandedNodes.has(rootId)) {
      addAffiliateNodes(allAffiliates, rootId, true, 1, 50 + levelWidth)
    }
  }

  return { nodes, edges }
}

export function CollapsibleTree({ groupCode, onBack }: Props) {
  const [showHolding, setShowHolding] = useState(true)
  const [showOthers, setShowOthers] = useState(true)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [selectedCompany, setSelectedCompany] = useState<{ corpNumber: string; name: string } | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['integratedGroup', groupCode],
    queryFn: () => fetchIntegratedGroup(groupCode),
  })

  // 초기 확장 상태 설정 (루트 노드만 펼침)
  useMemo(() => {
    if (expandedNodes.size === 0 && data) {
      if (data.holding_corp_number && data.tree.length > 0) {
        // 지주회사가 있는 경우
        setExpandedNodes(new Set([data.holding_corp_number]))
      } else {
        // 지주회사가 없는 경우
        setExpandedNodes(new Set(['group-root']))
      }
    }
  }, [data])

  const handleToggle = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }, [])

  const handleShowStockholders = useCallback((corpNumber: string, name: string) => {
    // 그룹 노드는 제외 (주주현황 조회 불가)
    if (corpNumber === 'other-affiliates' || corpNumber === 'group-root') return
    setSelectedCompany({ corpNumber, name })
  }, [])

  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    if (!data) {
      return { nodes: [], edges: [] }
    }
    return buildNodesAndEdges(
      data.holding_corp_number,
      data.holding_company || data.group_name,
      data.group_name,
      data.tree,
      data.other_affiliates,
      expandedNodes,
      handleToggle,
      handleShowStockholders,
      showHolding,
      showOthers
    )
  }, [data, expandedNodes, handleToggle, handleShowStockholders, showHolding, showOthers])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // 노드/엣지 업데이트
  useMemo(() => {
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

  const expandAll = () => {
    const allIds = new Set<string>()

    // 재귀적으로 모든 노드 ID 추가
    function addAll(nodes: CompanyNode[]) {
      for (const node of nodes) {
        allIds.add(node.corp_number)
        addAll(node.children)
      }
    }

    if (data.holding_corp_number && data.tree.length > 0) {
      // 지주회사가 있는 경우
      allIds.add(data.holding_corp_number)
      allIds.add('other-affiliates')
      addAll(data.tree)
      addAll(data.other_affiliates)  // 기타 계열사도 추가
    } else {
      // 지주회사가 없는 경우
      allIds.add('group-root')
      addAll(data.other_affiliates)  // 기타 계열사도 추가
    }

    setExpandedNodes(allIds)
  }

  const collapseAll = () => {
    if (data.holding_corp_number && data.tree.length > 0) {
      setExpandedNodes(new Set([data.holding_corp_number]))
    } else {
      setExpandedNodes(new Set(['group-root']))
    }
  }

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
          <div className="flex gap-2">
            <button
              onClick={expandAll}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
            >
              모두 펼치기
            </button>
            <button
              onClick={collapseAll}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
            >
              모두 접기
            </button>
          </div>
        </div>

        {/* 통계 */}
        <div className="flex flex-wrap gap-4 text-sm mb-4">
          <span className="bg-gray-100 px-3 py-1 rounded">
            전체 계열사: {data.stats.total_affiliates}개
          </span>
          {data.holding_company && data.tree.length > 0 ? (
            <>
              <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded">
                자회사: {data.stats.subsidiaries}개
              </span>
              <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded">
                손자회사: {data.stats.grandchildren}개
              </span>
              {data.stats.inferred_relations > 0 && (
                <span className="bg-orange-100 text-orange-800 px-3 py-1 rounded">
                  추론 관계: {data.stats.inferred_relations}개
                </span>
              )}
              <span className="bg-green-100 text-green-800 px-3 py-1 rounded">
                기타 계열사: {data.stats.other_affiliates}개
              </span>
            </>
          ) : (
            <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded">
              지주회사 구조 없음
            </span>
          )}
        </div>

        {/* 필터 토글 - 지주회사가 있는 경우에만 표시 */}
        {data.holding_company && data.tree.length > 0 && (
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showHolding}
                onChange={(e) => setShowHolding(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm">지주회사 구조</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showOthers}
                onChange={(e) => setShowOthers(e.target.checked)}
                className="w-4 h-4 text-green-600 rounded"
              />
              <span className="text-sm">기타 계열사</span>
            </label>
          </div>
        )}
      </div>

      {/* 그래프 */}
      <div className="h-[600px]">
        {nodes.length > 0 ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            attributionPosition="bottom-left"
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        ) : (
          <div className="flex justify-center items-center h-full text-gray-500">
            표시할 데이터가 없습니다
          </div>
        )}
      </div>

      {/* 범례 및 사용법 */}
      <div className="p-4 border-t">
        <div className="flex flex-wrap gap-6 text-sm mb-2">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ background: sourceStyles.root.bg }}></div>
            <span>지주회사</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ background: sourceStyles.holding.bg }}></div>
            <span>자회사/손자회사</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ background: sourceStyles.affiliate.bg }}></div>
            <span>기타 계열사</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ background: sourceStyles.both.bg }}></div>
            <span>지주구조+계열사</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0 border-t-2 border-dashed border-orange-500"></div>
            <span>주주현황 기반 추론</span>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          클릭: 하위 회사 펼치기/접기 | 📊: 주주현황 보기 | 점선: 주주현황 데이터 기반 추론된 소유관계
        </p>
      </div>

      {/* 주주현황 패널 */}
      {selectedCompany && (
        <StockholderPanel
          corpNumber={selectedCompany.corpNumber}
          companyName={selectedCompany.name}
          onClose={() => setSelectedCompany(null)}
        />
      )}
    </div>
  )
}
