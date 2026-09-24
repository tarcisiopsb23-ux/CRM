export interface ViaCEPResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  ibge: string;
  gia: string;
  ddd: string;
  siafi: string;
  erro?: boolean;
}

/**
 * Busca dados de endereço através de um CEP usando a API ViaCEP.
 * @param cep O CEP a ser pesquisado (com ou sem formatação)
 * @returns Objeto com dados do endereço ou null em caso de erro/não encontrado
 */
export async function fetchAddressByCep(cep: string): Promise<ViaCEPResponse | null> {
  const cleanCep = cep.replace(/\D/g, "");
  
  if (cleanCep.length !== 8) {
    return null;
  }

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
    if (!response.ok) throw new Error("Falha na busca do CEP");
    
    const data: ViaCEPResponse = await response.json();
    
    if (data.erro) {
      return null;
    }
    
    return data;
  } catch (error) {
    console.error("Erro ao buscar CEP:", error);
    return null;
  }
}
