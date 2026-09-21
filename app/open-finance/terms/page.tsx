export default function OpenFinanceTermsPage(){
  return <main className="legal-shell">
    <article className="legal-card">
      <div className="eyebrow">NestBalance · Open Finance</div>
      <h1>Termos para conexão de contas</h1>
      <p>Ao escolher conectar uma instituição financeira, você será direcionado para um fluxo de consentimento do Open Finance. A autorização é voluntária e você escolhe os dados compartilhados e a duração do consentimento.</p>
      <h2>O que o NestBalance usa</h2>
      <p>Quando autorizado, podemos receber dados de contas, saldos, movimentações, cartões, faturas e investimentos disponibilizados pela instituição conectada. Usamos esses dados para organizar sua visão financeira no seu Lar.</p>
      <h2>O que não fazemos</h2>
      <p>O NestBalance não solicita nem armazena sua senha bancária. O CPF e o nome informados para iniciar o consentimento são enviados ao provedor Open Finance e não são persistidos pelo NestBalance como parte da conexão.</p>
      <h2>Controle e revogação</h2>
      <p>Você pode interromper a atualização de uma conexão e, quando o gerenciamento de consentimentos estiver disponível no ambiente conectado, revogar o compartilhamento. Dados já importados permanecem sujeitos às regras de privacidade e exclusão aplicáveis.</p>
      <h2>Dados disponíveis</h2>
      <p>Cada instituição decide quais recursos disponibiliza no Open Finance. Recursos internos específicos, como divisões de saldo ou “cofrinhos”, só podem aparecer quando a instituição os expõe de forma autorizada como conta, saldo ou investimento.</p>
    </article>
  </main>;
}
