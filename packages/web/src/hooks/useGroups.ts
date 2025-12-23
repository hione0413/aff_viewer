import { useQuery } from '@tanstack/react-query'
import { fetchGroups } from '../services/sqlite-service'

export function useGroups(keyword?: string) {
  return useQuery({
    queryKey: ['groups', keyword],
    queryFn: () => fetchGroups(keyword),
    staleTime: 1000 * 60 * 60,
  })
}
