export type Locale = 'pt-BR' | 'en' | 'es';
export const messages = {
  'pt-BR': {
    brandTagline: 'Sua vida financeira, finalmente simples.',
    availableNow: 'disponíveis agora',
    attention: 'O que precisa da sua atenção',
    month: 'Seu mês',
    add: 'Adicionar',
    captureTitle: 'Jogue aqui. O NestBalance organiza.',
    captureHint: 'Escreva, cole uma lista ou envie um comprovante.',
    understood: 'Foi isso que entendemos',
    confirm: 'Confirmar',
    cancel: 'Voltar',
    emptyTitle: 'Seu mês começa aqui.',
    emptyBody: 'Envie um comprovante, uma fatura ou diga o que aconteceu com seu dinheiro.',
    signIn: 'Entrar com Google',
    setupMissing: 'Falta conectar o Firebase deste ambiente.'
  },
  en: {
    brandTagline: 'Your finances, finally simple.', availableNow: 'available now', attention: 'What needs your attention', month: 'Your month', add: 'Add',
    captureTitle: 'Drop it here. NestBalance organizes it.', captureHint: 'Write, paste a list, or send a receipt.', understood: 'Here is what we understood', confirm: 'Confirm', cancel: 'Back', emptyTitle: 'Your month starts here.', emptyBody: 'Send a receipt, statement, or tell us what happened with your money.', signIn: 'Continue with Google', setupMissing: 'Firebase is not connected in this environment.'
  },
  es: {
    brandTagline: 'Tus finanzas, por fin simples.', availableNow: 'disponibles ahora', attention: 'Lo que necesita tu atención', month: 'Tu mes', add: 'Agregar',
    captureTitle: 'Déjalo aquí. NestBalance lo organiza.', captureHint: 'Escribe, pega una lista o envía un comprobante.', understood: 'Esto es lo que entendimos', confirm: 'Confirmar', cancel: 'Volver', emptyTitle: 'Tu mes empieza aquí.', emptyBody: 'Envía un comprobante, un resumen o cuéntanos qué pasó con tu dinero.', signIn: 'Entrar con Google', setupMissing: 'Falta conectar Firebase en este entorno.'
  }
} as const;
