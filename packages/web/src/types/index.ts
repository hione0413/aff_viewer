export interface CorporateGroup {
  id: number
  code: string
  name: string
  owner: string | null
  representative_company: string | null
  affiliate_count: number
  group_type: string | null
  is_public: boolean
}

export interface Affiliate {
  id: number
  group_code: string
  name: string
  corporate_number: string | null
  business_number: string | null
  ceo: string | null
  founded_date: string | null
  affiliated_date: string | null
}

export interface GroupListResponse {
  total: number
  items: CorporateGroup[]
}

export interface AffiliateListResponse {
  total: number
  group_name: string | null
  items: Affiliate[]
}
