import { useQuery } from '@tanstack/react-query'
import { fetchAffiliates } from '../services/api'

export function useAffiliates(groupCode: string) {
  return useQuery({
    queryKey: ['affiliates', groupCode],
    queryFn: () => fetchAffiliates(groupCode),
    enabled: !!groupCode,
  })
}
