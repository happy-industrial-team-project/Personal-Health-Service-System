export const genders = ['unspecified', 'female', 'male', 'other'] as const;
export const bloodTypes = ['unknown', 'A', 'B', 'AB', 'O'] as const;
export type HealthProfile = {
  name: string;
  gender: typeof genders[number];
  birthDate: string | null;
  heightCm: number | null;
  weightKg: number | null;
  bloodType: typeof bloodTypes[number];
  medicalHistory: string;
  familyHistory: string;
  allergies: string;
  medications: string;
  version: number;
  updatedAt: string | null;
};
