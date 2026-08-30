// Shared types mirroring the Postgres schema in supabase/migrations/0001_init.sql.
// Keep this in sync with the migration by hand — there is no codegen step in Phase 1.

export type PropertyType =
  | "primary_residence"
  | "residential_rental_investment"
  | "commercial"
  | "land"
  | "industrial";

export const PROPERTY_TYPE_OPTIONS: { value: PropertyType; label: string }[] = [
  { value: "primary_residence", label: "Primary Residence" },
  { value: "residential_rental_investment", label: "Residential Rental / Investment" },
  { value: "commercial", label: "Commercial" },
  { value: "land", label: "Land" },
  { value: "industrial", label: "Industrial" },
];

// Not a literal column in the spec's Section 4 table — added because Section 6.1 requires
// capturing property subtype detail to catch excluded sub-types. See rules-engine.ts.
export type PropertySubtypeFlag =
  | "vacant_commercial"
  | "vacant_industrial"
  | "cemetery"
  | "church"
  | "quarry_or_mine"
  | "funeral_home"
  | "medical_facility"
  | "assisted_living_facility"
  | "gas_station"
  | "golf_course"
  | "ground_up_construction"
  | "dilapidated_or_fire_damaged";

export const PROPERTY_SUBTYPE_OPTIONS: { value: PropertySubtypeFlag; label: string }[] = [
  { value: "vacant_commercial", label: "Vacant commercial" },
  { value: "vacant_industrial", label: "Vacant industrial" },
  { value: "cemetery", label: "Cemetery" },
  { value: "church", label: "Church" },
  { value: "quarry_or_mine", label: "Quarry / mine" },
  { value: "funeral_home", label: "Funeral home" },
  { value: "medical_facility", label: "Medical facility (hospital, urgent care, nursing home, rehab center)" },
  { value: "assisted_living_facility", label: "Assisted living facility" },
  { value: "gas_station", label: "Gas station" },
  { value: "golf_course", label: "Golf course" },
  { value: "ground_up_construction", label: "Ground-up / early-stage construction" },
  { value: "dilapidated_or_fire_damaged", label: "Dilapidated or fire-damaged property" },
];

export type PositionSought = "first" | "second_behind_bank" | "private_lender_buyout";

export const POSITION_SOUGHT_OPTIONS: { value: PositionSought; label: string }[] = [
  { value: "first", label: "1st Position" },
  { value: "second_behind_bank", label: "2nd Position (Behind a Bank)" },
  { value: "private_lender_buyout", label: "Private Lender Buyout" },
];

export type ExitStrategy = "sale" | "refinance" | "business_proceeds" | "no_plan_yet";

export const EXIT_STRATEGY_OPTIONS: { value: ExitStrategy; label: string }[] = [
  { value: "sale", label: "Sale" },
  { value: "refinance", label: "Refinance" },
  { value: "business_proceeds", label: "Business Proceeds" },
  { value: "no_plan_yet", label: "No Plan Yet" },
];

export type ResultStatus = "disqualified" | "soft_offer_generated" | "needs_vp_call";

export interface Shop {
  id: string;
  shop_name: string;
  shop_code: string;
  active: boolean;
  created_at: string;
  created_by: string | null;
}

export interface Submission {
  id: string;
  shop_id: string;
  rep_name: string;
  rep_phone: string;
  rep_email: string;
  borrower_name: string | null;
  property_address: string | null;
  property_city: string | null;
  property_state: string | null;
  property_zip: string | null;
  property_type: PropertyType | null;
  property_subtypes: PropertySubtypeFlag[];
  assisted_living_converted_sfr: boolean;
  position_sought: PositionSought | null;
  current_value: number | null;
  current_debt_owed: number | null;
  exit_strategy: ExitStrategy | null;
  use_of_funds: string | null;
  sole_owner: boolean | null;
  co_owner_names: string | null;
  result_status: ResultStatus | null;
  disqualification_reason: string | null;
  soft_offer_min: number | null;
  soft_offer_max: number | null;
  estimated_monthly_min: number | null;
  estimated_monthly_max: number | null;
  created_at: string;
}

// The shape the deal form builds up client-side before it becomes a Submission row.
export interface DealFormState {
  rep_name: string;
  rep_phone: string;
  rep_email: string;
  property_state: string;
  property_type: PropertyType | "";
  property_subtypes: PropertySubtypeFlag[];
  assisted_living_converted_sfr: boolean;
  current_value: string; // kept as string while editing, parsed to number for calc
  position_sought: PositionSought | "";
  current_debt_owed: string;
  sole_owner: "" | "yes" | "no";
  co_owner_names: string;
  borrower_name: string;
  property_address: string;
  property_city: string;
  property_zip: string;
  exit_strategy: ExitStrategy | "";
  use_of_funds: string;
}

export const EMPTY_DEAL_FORM_STATE: DealFormState = {
  rep_name: "",
  rep_phone: "",
  rep_email: "",
  property_state: "",
  property_type: "",
  property_subtypes: [],
  assisted_living_converted_sfr: false,
  current_value: "",
  position_sought: "",
  current_debt_owed: "",
  sole_owner: "",
  co_owner_names: "",
  borrower_name: "",
  property_address: "",
  property_city: "",
  property_zip: "",
  exit_strategy: "",
  use_of_funds: "",
};
