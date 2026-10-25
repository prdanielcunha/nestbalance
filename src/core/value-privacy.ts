// Monetary figures in narrative responses must follow the same privacy setting
// as structured amounts. Dates, record counts and account endings stay legible.
export function maskMoneyInText(value:string){
  return value.replace(/(?:R\$|US\$|BRL|USD|EUR|[$€£])\s*[+−-]?\s*\d(?:[\d.,\u00a0\u202f ]*\d)?/gu,'••••').replace(/[+−-]?\d(?:[\d.,\u00a0\u202f ]*\d)?\s*(?:BRL|USD|EUR|R\$|US\$|[€£])/gu,'••••');
}
