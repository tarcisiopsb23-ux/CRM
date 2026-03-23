export type AbsenceTipo   = 'ferias' | 'atestado' | 'falta';
export type AbsenceStatus = 'aprovado' | 'pendente';

export interface EmployeeAbsence {
  id:              string;
  organization_id: string;
  collaborator_id: string;
  tipo:            AbsenceTipo;
  data_inicio:     string;
  data_fim:        string;
  status:          AbsenceStatus;
  observacao:      string | null;
  created_at:      string;
}

export interface EmployeeEvaluation {
  id:              string;
  organization_id: string;
  collaborator_id: string;
  periodo:         string;
  produtividade:   number;
  qualidade:       number;
  pontualidade:    number;
  comportamento:   number;
  nota_final:      number;
  feedback:        string | null;
  created_at:      string;
}

export type TrainingStatus = 'concluido' | 'pendente';

export interface EmployeeTraining {
  id:               string;
  organization_id:  string;
  collaborator_id:  string;
  nome_treinamento: string;
  data:             string | null;
  data_fim:         string | null;
  observacao:       string | null;
  status:           TrainingStatus;
  resultado:        string | null;
  created_at:       string;
}
