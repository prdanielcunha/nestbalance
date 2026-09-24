export type ImporterId=
  | 'universal_text'
  | 'generic_csv'
  | 'native_pdf'
  | 'image_screen'
  | 'card_invoice'
  | 'account_screen'
  | 'savings_pot_screen';

export type ImporterDescriptor={
  id:ImporterId;
  input:'text'|'csv'|'pdf'|'image';
  localFirst:boolean;
  duplicateDetection:'before_expensive_processing'|'during_commit';
  aiFallback:boolean;
  description:string;
};

export const IMPORTER_REGISTRY:readonly ImporterDescriptor[]=[
  {id:'universal_text',input:'text',localFirst:true,duplicateDetection:'during_commit',aiFallback:false,description:'Texto e listas em linguagem natural.'},
  {id:'generic_csv',input:'csv',localFirst:true,duplicateDetection:'before_expensive_processing',aiFallback:false,description:'CSV genérico com normalização de datas, valores e direção.'},
  {id:'native_pdf',input:'pdf',localFirst:true,duplicateDetection:'before_expensive_processing',aiFallback:true,description:'PDF com extração de texto nativo antes de OCR ou IA.'},
  {id:'image_screen',input:'image',localFirst:true,duplicateDetection:'before_expensive_processing',aiFallback:true,description:'Prints e imagens com OCR local antes de fallback externo.'},
  {id:'card_invoice',input:'pdf',localFirst:true,duplicateDetection:'before_expensive_processing',aiFallback:true,description:'Faturas de cartão com revisão e deduplicação de itens.'},
  {id:'account_screen',input:'image',localFirst:true,duplicateDetection:'before_expensive_processing',aiFallback:true,description:'Prints de saldo e conta sem transformar saldo em receita.'},
  {id:'savings_pot_screen',input:'image',localFirst:true,duplicateDetection:'before_expensive_processing',aiFallback:true,description:'Cofrinhos/metas reconhecidos sem movimentar dinheiro no banco.'}
] as const;

export function importerById(id:unknown){
  return IMPORTER_REGISTRY.find(item=>item.id===id)??null;
}
