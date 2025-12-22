import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
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

// 검색 결과 타입
interface SearchResult {
  id: string
  name: string
  path: string[]  // 루트부터 해당 노드까지의 경로 (ID 목록)
}

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
  [key: string]: unknown  // Index signature for React Flow compatibility
  label: string
  childCount: number
  isExpanded: boolean
  hasChildren: boolean
  source: string
  level: number
  ownershipRate?: number | null
  inferred?: boolean  // 주주현황 기반 추론 관계
  highlighted?: boolean  // 검색 결과 하이라이트
  // 최대주주 정보 (불일치 감지용)
  legalParentName?: string | null
  largestStockholder?: string | null
  largestStockholderRate?: number | null
  parentMismatch?: boolean
  onToggle: (nodeId: string) => void
  onShowStockholders: (nodeId: string, label: string) => void
}

function CompanyNodeComponent({ id, data }: NodeProps<Node<CustomNodeData>>) {
  const {
    label, childCount, isExpanded, hasChildren, source, level, inferred, highlighted,
    legalParentName, largestStockholder, largestStockholderRate, parentMismatch,
    onToggle, onShowStockholders
  } = data

  const [showTooltip, setShowTooltip] = useState(false)

  const style = source === 'root'
    ? sourceStyles.root
    : sourceStyles[source as keyof typeof sourceStyles] || sourceStyles.holding

  const fontSize = level === 0 ? '14px' : level === 1 ? '12px' : '11px'
  const padding = level === 0 ? '12px 20px' : level === 1 ? '10px 16px' : '8px 12px'

  // "기타 계열사" 그룹 노드는 주주현황 버튼 숨김
  const showStockholderBtn = id !== 'other-affiliates' && id !== 'group-root'

  // 추론된 관계인 경우 테두리 스타일 변경
  const borderStyle = inferred ? 'dashed' : 'solid'

  // 하이라이트된 노드 스타일
  const highlightStyle = highlighted ? {
    boxShadow: '0 0 0 3px #fbbf24, 0 0 12px rgba(251, 191, 36, 0.4)',
  } : {}

  // 툴팁에 표시할 정보가 있는지 확인
  const hasTooltipInfo = legalParentName || largestStockholder

  return (
    <div
      style={{
        background: style.bg,
        border: `2px ${borderStyle} ${style.border}`,
        borderRadius: '8px',
        padding,
        color: 'white',
        fontSize,
        position: 'relative',
        fontWeight: level === 0 ? 'bold' : 'normal',
        minWidth: '120px',
        textAlign: 'center',
        cursor: hasChildren ? 'pointer' : 'default',
        transition: 'all 0.3s ease',
        ...highlightStyle,
      }}
      onClick={() => hasChildren && onToggle(id)}
      onMouseEnter={() => hasTooltipInfo && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <Handle type="target" position={Position.Left} style={{ visibility: 'hidden' }} />

      {/* 불일치 경고 아이콘 */}
      {parentMismatch && (
        <div
          style={{
            position: 'absolute',
            top: '-8px',
            right: '-8px',
            width: '20px',
            height: '20px',
            background: '#f59e0b',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 'bold',
            border: '2px solid white',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          }}
          title="법적 상위회사와 최대주주가 다릅니다"
        >
          !
        </div>
      )}

      {/* 호버 툴팁 */}
      {showTooltip && hasTooltipInfo && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: '8px',
            padding: '8px 12px',
            background: 'white',
            color: '#333',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            fontSize: '11px',
            whiteSpace: 'nowrap',
            zIndex: 1000,
            textAlign: 'left',
            minWidth: '180px',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#1e40af' }}>
            {label}
          </div>
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '4px' }}>
            {legalParentName && (
              <div style={{ marginBottom: '2px' }}>
                <span style={{ color: '#6b7280' }}>법적 상위: </span>
                <span>{legalParentName}</span>
              </div>
            )}
            {largestStockholder && (
              <div style={{ color: parentMismatch ? '#f59e0b' : 'inherit' }}>
                <span style={{ color: '#6b7280' }}>최대주주: </span>
                <span style={{ fontWeight: parentMismatch ? 'bold' : 'normal' }}>
                  {largestStockholder} ({largestStockholderRate?.toFixed(1)}%)
                </span>
              </div>
            )}
          </div>
          {/* 툴팁 화살표 */}
          <div
            style={{
              position: 'absolute',
              bottom: '-6px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '6px solid white',
            }}
          />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
        <span>{label}</span>
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
            }}
            title="주주현황 보기"
          >
            📊
          </button>
        )}
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
  highlightedNodeId: string | null,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  const nodeHeight = 60   // 노드 간 세로 간격
  const baseGap = 80      // 노드 간 최소 가로 간격

  // 노드 너비 추정 (글자 수 기반)
  function estimateNodeWidth(label: string, level: number): number {
    const fontSize = level === 0 ? 14 : level === 1 ? 12 : 11
    const charWidth = fontSize * 0.7  // 한글 기준 대략적인 글자 너비
    const padding = level === 0 ? 40 : level === 1 ? 32 : 24
    const buttonWidth = 80  // 펼치기 버튼 + 주주현황 버튼
    return Math.max(120, label.length * charWidth + padding + buttonWidth)
  }

  // 각 레벨별 최대 x 위치 추적 (노드 오른쪽 끝)
  const levelMaxX: Map<number, number> = new Map()

  // 현재 Y 위치 추적
  let currentY = 50

  // 지주회사가 있는 경우
  const hasHoldingStructure = holdingCorpNumber && tree.length > 0

  if (hasHoldingStructure && showHolding) {
    // 지주회사 노드
    const rootId = holdingCorpNumber
    const totalChildren = tree.reduce((sum, c) => sum + 1 + countAllChildren(c), 0)
    const rootX = 50
    const rootWidth = estimateNodeWidth(holdingName, 0)

    nodes.push({
      id: rootId,
      type: 'company',
      position: { x: rootX, y: currentY },
      data: {
        label: holdingName,
        childCount: totalChildren,
        highlighted: highlightedNodeId === rootId,
        isExpanded: expandedNodes.has(rootId),
        hasChildren: tree.length > 0,
        source: 'root',
        level: 0,
        onToggle,
        onShowStockholders,
      },
    })

    // 레벨 0의 최대 x 위치 설정
    levelMaxX.set(0, rootX + rootWidth)

    // 재귀적으로 노드 추가 (수평 레이아웃)
    function addNodes(
      children: CompanyNode[],
      parentId: string,
      parentExpanded: boolean,
      level: number
    ): void {
      if (!parentExpanded) return

      // 이전 레벨의 최대 x 위치를 기준으로 현재 레벨의 시작 x 계산
      const prevLevelMaxX = levelMaxX.get(level - 1) || 50
      const currentLevelX = prevLevelMaxX + baseGap

      children.forEach((child) => {
        const childId = child.corp_number
        const isExpanded = expandedNodes.has(childId)
        const childCount = countAllChildren(child)
        const isInferred = child.inferred === true
        const nodeWidth = estimateNodeWidth(child.name, level)

        currentY += nodeHeight

        nodes.push({
          id: childId,
          type: 'company',
          position: { x: currentLevelX, y: currentY },
          data: {
            label: child.name,
            childCount,
            isExpanded,
            hasChildren: child.children.length > 0,
            source: child.source,
            level,
            ownershipRate: child.ownership_rate,
            inferred: isInferred,
            highlighted: highlightedNodeId === childId,
            legalParentName: child.legal_parent_name,
            largestStockholder: child.largest_stockholder,
            largestStockholderRate: child.largest_stockholder_rate,
            parentMismatch: child.parent_mismatch,
            onToggle,
            onShowStockholders,
          },
        })

        // 현재 레벨의 최대 x 위치 업데이트
        const currentMaxX = levelMaxX.get(level) || 0
        levelMaxX.set(level, Math.max(currentMaxX, currentLevelX + nodeWidth))

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
          addNodes(child.children, childId, true, level + 1)
        }
      })
    }

    // 1레벨(자회사)부터 시작
    if (expandedNodes.has(rootId)) {
      addNodes(tree, rootId, true, 1)
    }

    // 기타 계열사 (지주회사가 있는 경우)
    if (showOthers && otherAffiliates.length > 0) {
      currentY += nodeHeight * 1.5
      const otherGroupId = 'other-affiliates'

      // 기타 계열사 전체 자식 수 계산
      const totalOtherChildren = otherAffiliates.reduce((sum, a) => sum + 1 + countAllChildren(a), 0)

      // 레벨 1 시작 x 위치 계산
      const otherGroupX = (levelMaxX.get(0) || 50) + baseGap
      const otherGroupWidth = estimateNodeWidth('기타 계열사', 1)

      nodes.push({
        id: otherGroupId,
        type: 'company',
        position: { x: otherGroupX, y: currentY },
        data: {
          label: '기타 계열사',
          childCount: totalOtherChildren,
          isExpanded: expandedNodes.has(otherGroupId),
          hasChildren: true,
          source: 'affiliate',
          level: 1,
          highlighted: highlightedNodeId === otherGroupId,
          onToggle,
          onShowStockholders,
        },
      })

      // 기타 계열사 그룹의 레벨 1 최대 x 업데이트
      const currentLevel1MaxX = levelMaxX.get(1) || 0
      levelMaxX.set(1, Math.max(currentLevel1MaxX, otherGroupX + otherGroupWidth))

      edges.push({
        id: `${rootId}-${otherGroupId}`,
        source: rootId,
        target: otherGroupId,
        type: 'smoothstep',
        style: { stroke: '#9ca3af', strokeWidth: 2, strokeDasharray: '5,5' },
      })

      // 기타 계열사용 레벨별 최대 x 위치 (별도 관리)
      const otherLevelMaxX: Map<number, number> = new Map()
      otherLevelMaxX.set(1, otherGroupX + otherGroupWidth)

      // 기타 계열사 트리 재귀 추가
      function addOtherAffiliateNodes(
        affiliateList: CompanyNode[],
        parentId: string,
        parentExpanded: boolean,
        level: number
      ): void {
        if (!parentExpanded) return

        // 이전 레벨의 최대 x 위치를 기준으로 현재 레벨의 시작 x 계산
        const prevLevelMaxX = otherLevelMaxX.get(level - 1) || otherGroupX
        const currentLevelX = prevLevelMaxX + baseGap

        affiliateList.forEach((affiliate) => {
          const affiliateId = affiliate.corp_number
          const isExpanded = expandedNodes.has(affiliateId)
          const childCount = countAllChildren(affiliate)
          const isInferred = affiliate.inferred === true
          const hasChildren = affiliate.children.length > 0
          const nodeWidth = estimateNodeWidth(affiliate.name, level)

          currentY += nodeHeight

          nodes.push({
            id: affiliateId,
            type: 'company',
            position: { x: currentLevelX, y: currentY },
            data: {
              label: affiliate.name,
              childCount,
              isExpanded,
              hasChildren,
              source: 'affiliate',
              level,
              ownershipRate: affiliate.ownership_rate,
              inferred: isInferred,
              highlighted: highlightedNodeId === affiliateId,
              legalParentName: affiliate.legal_parent_name,
              largestStockholder: affiliate.largest_stockholder,
              largestStockholderRate: affiliate.largest_stockholder_rate,
              parentMismatch: affiliate.parent_mismatch,
              onToggle,
              onShowStockholders,
            },
          })

          // 현재 레벨의 최대 x 위치 업데이트
          const currentMaxX = otherLevelMaxX.get(level) || 0
          otherLevelMaxX.set(level, Math.max(currentMaxX, currentLevelX + nodeWidth))

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
            addOtherAffiliateNodes(affiliate.children, affiliateId, true, level + 1)
          }
        })
      }

      if (expandedNodes.has(otherGroupId)) {
        addOtherAffiliateNodes(otherAffiliates, otherGroupId, true, 2)
      }
    }
  } else {
    // 지주회사가 없는 경우: 기업집단을 루트로 하고 모든 계열사 표시
    const allAffiliates = [...otherAffiliates]
    if (allAffiliates.length === 0) {
      return { nodes, edges }
    }

    const rootId = 'group-root'
    const rootX = 50
    const rootWidth = estimateNodeWidth(groupName, 0)

    // 전체 자식 수 계산
    const totalChildren = allAffiliates.reduce((sum, a) => sum + 1 + countAllChildren(a), 0)

    // 기업집단 루트 노드
    nodes.push({
      id: rootId,
      type: 'company',
      position: { x: rootX, y: currentY },
      data: {
        label: groupName,
        childCount: totalChildren,
        isExpanded: expandedNodes.has(rootId),
        hasChildren: true,
        source: 'root',
        level: 0,
        highlighted: highlightedNodeId === rootId,
        onToggle,
        onShowStockholders,
      },
    })

    // 레벨 0의 최대 x 위치 설정
    levelMaxX.set(0, rootX + rootWidth)

    // 계열사 트리 재귀 추가
    function addAffiliateNodes(
      affiliateList: CompanyNode[],
      parentId: string,
      parentExpanded: boolean,
      level: number
    ): void {
      if (!parentExpanded) return

      // 이전 레벨의 최대 x 위치를 기준으로 현재 레벨의 시작 x 계산
      const prevLevelMaxX = levelMaxX.get(level - 1) || rootX
      const currentLevelX = prevLevelMaxX + baseGap

      affiliateList.forEach((affiliate) => {
        const affiliateId = affiliate.corp_number
        const isExpanded = expandedNodes.has(affiliateId)
        const childCount = countAllChildren(affiliate)
        const isInferred = affiliate.inferred === true
        const hasChildren = affiliate.children.length > 0
        const nodeWidth = estimateNodeWidth(affiliate.name, level)

        currentY += nodeHeight

        nodes.push({
          id: affiliateId,
          type: 'company',
          position: { x: currentLevelX, y: currentY },
          data: {
            label: affiliate.name,
            childCount,
            isExpanded,
            hasChildren,
            source: 'affiliate',
            level,
            ownershipRate: affiliate.ownership_rate,
            inferred: isInferred,
            highlighted: highlightedNodeId === affiliateId,
            legalParentName: affiliate.legal_parent_name,
            largestStockholder: affiliate.largest_stockholder,
            largestStockholderRate: affiliate.largest_stockholder_rate,
            parentMismatch: affiliate.parent_mismatch,
            onToggle,
            onShowStockholders,
          },
        })

        // 현재 레벨의 최대 x 위치 업데이트
        const currentMaxX = levelMaxX.get(level) || 0
        levelMaxX.set(level, Math.max(currentMaxX, currentLevelX + nodeWidth))

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
          addAffiliateNodes(affiliate.children, affiliateId, true, level + 1)
        }
      })
    }

    // 계열사 표시
    if (expandedNodes.has(rootId)) {
      addAffiliateNodes(allAffiliates, rootId, true, 1)
    }
  }

  return { nodes, edges }
}

// 트리에서 회사 검색 (재귀)
function searchInTree(
  nodes: CompanyNode[],
  query: string,
  currentPath: string[],
  rootId: string,
): SearchResult[] {
  const results: SearchResult[] = []
  const lowerQuery = query.toLowerCase()

  for (const node of nodes) {
    const nodePath = [...currentPath, node.corp_number]

    if (node.name.toLowerCase().includes(lowerQuery)) {
      results.push({
        id: node.corp_number,
        name: node.name,
        path: nodePath,
      })
    }

    // 자식 노드 검색
    if (node.children.length > 0) {
      results.push(...searchInTree(node.children, query, nodePath, rootId))
    }
  }

  return results
}

// 내부 컴포넌트 (useReactFlow 사용을 위해 분리)
function CollapsibleTreeInner({
  onBack,
  data,
}: {
  onBack: () => void
  data: NonNullable<Awaited<ReturnType<typeof fetchIntegratedGroup>>>
}) {
  const [showHolding, setShowHolding] = useState(true)
  const [showOthers, setShowOthers] = useState(true)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [selectedCompany, setSelectedCompany] = useState<{ corpNumber: string; name: string } | null>(null)

  // 검색 관련 상태
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null)
  const [showSearchResults, setShowSearchResults] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 도움말 모달 상태
  const [showHelpModal, setShowHelpModal] = useState(false)

  // 미니맵 표시 상태 (기본: 숨김)
  const [showMiniMap, setShowMiniMap] = useState(false)

  const { fitView } = useReactFlow()

  // 초기 확장 상태 설정 (루트 노드만 펼침)
  useEffect(() => {
    if (expandedNodes.size === 0) {
      if (data.holding_corp_number && data.tree.length > 0) {
        setExpandedNodes(new Set([data.holding_corp_number]))
      } else {
        setExpandedNodes(new Set(['group-root']))
      }
    }
  }, [])

  // 검색 결과 계산
  const searchResults = useMemo(() => {
    if (searchQuery.length < 2) return []

    const results: SearchResult[] = []
    const rootId = data.holding_corp_number || 'group-root'

    // 지주회사 트리에서 검색
    if (data.tree.length > 0) {
      results.push(...searchInTree(data.tree, searchQuery, [rootId], rootId))
    }

    // 기타 계열사에서 검색
    if (data.other_affiliates.length > 0) {
      const otherPath = data.holding_corp_number
        ? [rootId, 'other-affiliates']
        : [rootId]
      results.push(...searchInTree(data.other_affiliates, searchQuery, otherPath, rootId))
    }

    return results.slice(0, 10) // 최대 10개만 표시
  }, [searchQuery, data])

  // 검색 결과 클릭 핸들러
  const handleSearchResultClick = useCallback((result: SearchResult) => {
    // 1. 경로의 모든 노드 펼치기
    setExpandedNodes(prev => {
      const next = new Set(prev)
      result.path.forEach(id => next.add(id))
      return next
    })

    // 2. 하이라이트 설정
    setHighlightedNodeId(result.id)

    // 3. 검색창 닫기
    setSearchQuery('')
    setShowSearchResults(false)

    // 4. 잠시 후 해당 노드로 포커스 (노드가 렌더링된 후)
    setTimeout(() => {
      fitView({ nodes: [{ id: result.id }], duration: 500, padding: 0.5 })
    }, 100)

    // 5. 3초 후 하이라이트 해제
    setTimeout(() => {
      setHighlightedNodeId(null)
    }, 3000)
  }, [fitView])

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
      showOthers,
      highlightedNodeId
    )
  }, [data, expandedNodes, handleToggle, handleShowStockholders, showHolding, showOthers, highlightedNodeId])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // 노드/엣지 업데이트
  useMemo(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialNodes, initialEdges, setNodes, setEdges])

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
      <div className="p-3 md:p-4 border-b">
        {/* 첫째 줄: 목록 버튼 + 기업명 */}
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={onBack}
            className="text-gray-600 hover:text-gray-900 text-sm md:text-base shrink-0"
          >
            ← 목록
          </button>
          <div className="min-w-0 flex-1">
            <span className="text-base md:text-xl font-bold text-gray-900 block truncate">
              {data.group_name}
            </span>
            {data.owner && (
              <span className="text-xs md:text-sm text-gray-500">
                동일인: {data.owner}
              </span>
            )}
          </div>
        </div>

        {/* 둘째 줄: 검색창 (모바일에서는 전체 너비) */}
        <div className="relative mb-3">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="회사명 검색..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setShowSearchResults(true)
            }}
            onFocus={() => setShowSearchResults(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchQuery('')
                setShowSearchResults(false)
                searchInputRef.current?.blur()
              } else if (e.key === 'Enter' && searchResults.length > 0) {
                handleSearchResultClick(searchResults[0])
              }
            }}
            className="w-full md:w-64 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />

          {/* 검색 결과 드롭다운 */}
          {showSearchResults && searchQuery.length >= 2 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
              {searchResults.length > 0 ? (
                searchResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => handleSearchResultClick(result)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none border-b border-gray-100 last:border-b-0"
                  >
                    <span className="font-medium text-gray-900">{result.name}</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-sm text-gray-500">
                  검색 결과가 없습니다
                </div>
              )}
            </div>
          )}
        </div>

        {/* 셋째 줄: 통계 (모바일에서 스크롤 가능) */}
        <div className="flex gap-2 overflow-x-auto pb-2 text-xs md:text-sm mb-2 -mx-3 px-3 md:mx-0 md:px-0 md:flex-wrap">
          <span className="bg-gray-100 px-2 md:px-3 py-1 rounded whitespace-nowrap shrink-0">
            전체: {data.stats.total_affiliates}개
          </span>
          {data.holding_company && data.tree.length > 0 ? (
            <>
              <span className="bg-blue-100 text-blue-800 px-2 md:px-3 py-1 rounded whitespace-nowrap shrink-0">
                자회사: {data.stats.subsidiaries}개
              </span>
              <span className="bg-blue-50 text-blue-600 px-2 md:px-3 py-1 rounded whitespace-nowrap shrink-0">
                손자: {data.stats.grandchildren}개
              </span>
              {data.stats.inferred_relations > 0 && (
                <span className="bg-orange-100 text-orange-800 px-2 md:px-3 py-1 rounded whitespace-nowrap shrink-0">
                  추론: {data.stats.inferred_relations}개
                </span>
              )}
              <span className="bg-green-100 text-green-800 px-2 md:px-3 py-1 rounded whitespace-nowrap shrink-0">
                기타: {data.stats.other_affiliates}개
              </span>
            </>
          ) : (
            <span className="bg-yellow-100 text-yellow-800 px-2 md:px-3 py-1 rounded whitespace-nowrap shrink-0">
              지주회사 구조 없음
            </span>
          )}
        </div>

        {/* 넷째 줄: 필터 토글 - 지주회사가 있는 경우에만 표시 */}
        {data.holding_company && data.tree.length > 0 && (
          <div className="flex gap-3 md:gap-4 text-xs md:text-sm">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showHolding}
                onChange={(e) => setShowHolding(e.target.checked)}
                className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-600 rounded"
              />
              <span>지주구조</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showOthers}
                onChange={(e) => setShowOthers(e.target.checked)}
                className="w-3.5 h-3.5 md:w-4 md:h-4 text-green-600 rounded"
              />
              <span>기타 계열사</span>
            </label>
          </div>
        )}
      </div>

      {/* 그래프 */}
      <div className="h-[calc(100vh-280px)] md:h-[600px] min-h-[400px] relative">
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
            nodesDraggable={false}
            panOnDrag
            panOnScroll={false}
            zoomOnPinch
            zoomOnScroll
            preventScrolling
          >
            <Background />
            <Controls />
            {showMiniMap && <MiniMap />}
          </ReactFlow>
        ) : (
          <div className="flex justify-center items-center h-full text-gray-500">
            표시할 데이터가 없습니다
          </div>
        )}

        {/* 플로팅 컨트롤 버튼 (우측 상단) */}
        <div className="absolute top-3 right-3 flex gap-1 bg-white/90 backdrop-blur rounded-lg shadow-lg p-1 z-10">
          <button
            onClick={expandAll}
            className="w-8 h-8 flex items-center justify-center text-lg bg-gray-100 hover:bg-blue-100 hover:text-blue-600 rounded transition-colors"
            title="모두 펼치기"
          >
            ⊕
          </button>
          <button
            onClick={collapseAll}
            className="w-8 h-8 flex items-center justify-center text-lg bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            title="모두 접기"
          >
            ⊖
          </button>
          <div className="w-px bg-gray-300 mx-0.5" />
          <button
            onClick={() => setShowMiniMap(!showMiniMap)}
            className={`w-8 h-8 flex items-center justify-center text-lg rounded transition-colors ${
              showMiniMap
                ? 'bg-blue-100 text-blue-600'
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
            title={showMiniMap ? '미니맵 숨기기' : '미니맵 보기'}
          >
            🗺️
          </button>
          <div className="w-px bg-gray-300 mx-0.5" />
          <button
            onClick={() => setShowHelpModal(true)}
            className="w-8 h-8 flex items-center justify-center text-lg bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            title="도움말"
          >
            ?
          </button>
        </div>
      </div>

      {/* 범례 및 사용법 - 데스크탑에서만 표시 */}
      <div className="hidden md:block p-4 border-t">
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
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center font-bold">!</div>
            <span>법적 상위 ≠ 최대주주</span>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          클릭: 펼치기/접기 | 호버: 상세 정보 | 📊: 주주현황 | 점선: 추론된 관계 | !: 법적 상위와 실제 최대주주 불일치
        </p>
      </div>

      {/* 도움말 모달 */}
      {showHelpModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50"
          onClick={() => setShowHelpModal(false)}
        >
          <div
            className="bg-white w-full md:max-w-md md:rounded-lg rounded-t-2xl shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-bold text-gray-900">도움말</h3>
              <button
                onClick={() => setShowHelpModal(false)}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ×
              </button>
            </div>

            {/* 모달 내용 */}
            <div className="p-4 space-y-4">
              {/* 노드 색상 범례 */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">노드 색상</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
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
                </div>
              </div>

              {/* 선 스타일 */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">연결선</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-0 border-t-2 border-blue-500"></div>
                    <span>공식 지주회사 구조</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-0 border-t-2 border-dashed border-green-500"></div>
                    <span>주주현황 기반 추론</span>
                  </div>
                </div>
              </div>

              {/* 아이콘 설명 */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">아이콘</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-base">📊</span>
                    <span>주주현황 보기</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center font-bold">!</div>
                    <span>법적 상위 ≠ 최대주주</span>
                  </div>
                </div>
              </div>

              {/* 조작 방법 */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">조작 방법</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• 노드 클릭: 하위 회사 펼치기/접기</li>
                  <li>• 드래그: 화면 이동</li>
                  <li>• 핀치/스크롤: 확대/축소</li>
                </ul>
              </div>
            </div>

            {/* 닫기 버튼 */}
            <div className="p-4 border-t">
              <button
                onClick={() => setShowHelpModal(false)}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

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

// 외부 컴포넌트 - 데이터 fetching + ReactFlowProvider 래핑
export function CollapsibleTree({ groupCode, onBack }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['integrated-group', groupCode],
    queryFn: () => fetchIntegratedGroup(groupCode),
  })

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
    <ReactFlowProvider>
      <CollapsibleTreeInner onBack={onBack} data={data} />
    </ReactFlowProvider>
  )
}
