import { useQuery } from '@tanstack/react-query'
import { fetchGroups } from '../services/api'

export function useGroups(keyword?: string) {
  return useQuery({
    queryKey: ['groups', keyword],
    queryFn: () => fetchGroups(keyword),
  })
}
