export type JobOpeningStatus = 'aberta' | 'pausada' | 'encerrada';
export type LocationType = 'presencial' | 'remoto' | 'hibrido';
export type QuestionType = 'text' | 'single_choice' | 'multiple_choice' | 'scale_1_5' | 'yes_no';
export type ApplicationStatus = 'novo' | 'em_analise' | 'aprovado' | 'reprovado' | 'contratado';
export type ApplicationSource = 'web' | 'agent' | 'manual';

/** Requisito estruturado de uma vaga — armazenado em requirements_list */
export interface JobRequirement {
  id: string;          // uuid gerado no frontend
  label: string;       // ex: "Experiência em tráfego pago"
  weight: number;      // 1–10 — peso na pontuação
  is_required: boolean;// se é eliminatório
}

/** Requisito marcado pelo candidato */
export interface RequirementMatch {
  id: string;
  label: string;
  weight: number;
  checked: boolean;
}

export interface JobOpening {
  id: string;
  organization_id: string;
  title: string;
  job_title: string | null;
  department: string | null;
  description: string | null;
  requirements: string | null;
  requirements_list?: JobRequirement[] | null;
  location_type: LocationType | null;
  salary_range: string | null;
  status: JobOpeningStatus;
  published_at: string | null;
  closes_at: string | null;
  created_at: string;
  updated_at: string;
  // computed (joined)
  candidate_count?: number;
  new_candidate_count?: number;
  avg_score?: number;
}

export interface JobFormQuestion {
  id: string;
  job_opening_id: string;
  organization_id: string;
  question_text: string;
  question_type: QuestionType;
  options: string[] | null;
  correct_answer: string | string[] | null;
  weight: number;
  is_required: boolean;
  sort_order: number;
  created_at: string;
}

export interface Candidate {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  resume_drive_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicationAnswer {
  question_id: string;
  question_text: string;
  question_type: QuestionType;
  answer: string | string[];
  score: number;
  max_score: number;
}

export interface Application {
  id: string;
  organization_id: string;
  job_opening_id: string;
  candidate_id: string;
  cover_letter: string | null;
  answers: ApplicationAnswer[];
  requirements_match: RequirementMatch[];
  score_requirements: number;
  score_auto: number;
  score_manual: number | null;
  score_total: number;
  score_max: number;
  score_percent: number;
  status: ApplicationStatus;
  notes: string | null;
  source: ApplicationSource;
  applied_at: string;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  // joined
  candidate?: Candidate;
  job_opening?: Pick<JobOpening, 'id' | 'title' | 'job_title' | 'department'>;
}

export interface TalentPool {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  resume_drive_url: string | null;
  desired_role: string | null;
  cover_letter: string | null;
  requirements_match: RequirementMatch[];
  answers: ApplicationAnswer[];
  score_requirements: number;
  score_answers: number;
  score_total: number;
  score_max: number;
  score_percent: number;
  status: ApplicationStatus;
  notes: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface RecruitmentConfig {
  drive_folder_id?: string;
  drive_folder_url?: string;
  drive_webhook_url?: string;
  notification_email?: string;
  auto_notify?: boolean;
}

export interface ApplicationFormData {
  full_name: string;
  email: string;
  phone: string;
  linkedin_url?: string;
  portfolio_url?: string;
  cover_letter?: string;
  answers: Record<string, string | string[]>;
  requirements_match?: RequirementMatch[];
  resume_file?: File;
}

export interface JobOpening {
  id: string;
  organization_id: string;
  title: string;
  job_title: string | null;
  department: string | null;
  description: string | null;
  requirements: string | null;
  location_type: LocationType | null;
  salary_range: string | null;
  status: JobOpeningStatus;
  published_at: string | null;
  closes_at: string | null;
  created_at: string;
  updated_at: string;
  // computed (joined)
  candidate_count?: number;
  new_candidate_count?: number;
  avg_score?: number;
}

export interface JobFormQuestion {
  id: string;
  job_opening_id: string;
  organization_id: string;
  question_text: string;
  question_type: QuestionType;
  options: string[] | null;
  correct_answer: string | string[] | null;
  weight: number;
  is_required: boolean;
  sort_order: number;
  created_at: string;
}

export interface Candidate {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  resume_drive_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicationAnswer {
  question_id: string;
  question_text: string;
  question_type: QuestionType;
  answer: string | string[];
  score: number;
  max_score: number;
}

export interface Application {
  id: string;
  organization_id: string;
  job_opening_id: string;
  candidate_id: string;
  cover_letter: string | null;
  answers: ApplicationAnswer[];
  score_auto: number;
  score_manual: number | null;
  score_total: number;
  score_max: number;
  score_percent: number;
  status: ApplicationStatus;
  notes: string | null;
  source: ApplicationSource;
  applied_at: string;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  // joined
  candidate?: Candidate;
  job_opening?: Pick<JobOpening, 'id' | 'title' | 'job_title' | 'department'>;
}

export interface RecruitmentConfig {
  drive_folder_id?: string;
  drive_folder_url?: string;
  drive_webhook_url?: string;  // URL do webhook n8n para upload de currículos
  notification_email?: string;
  auto_notify?: boolean;
}

export interface ApplicationFormData {
  full_name: string;
  email: string;
  phone: string;
  linkedin_url?: string;
  portfolio_url?: string;
  cover_letter?: string;
  answers: Record<string, string | string[]>;
  resume_file?: File;
}
