# NestBalance

Primeira fundação executável do NestBalance, baseada no Blueprint Master v1.1.

## Estado atual

Implementada a primeira fatia de produto: autenticação Firebase, bootstrap de Household, Home sem dashboard genérico, entrada universal por texto/arquivo, interpretação determinística inicial, confirmação mínima, persistência de Transaction/Commitment, armazenamento imutável da evidência original, Extraction versionada, AuditEvent e Timeline.

A camada de IA/vision/OCR ainda não é considerada concluída: o parser atual é deliberadamente determinístico e serve como primeira camada barata do pipeline. Arquivos são preservados, mas a extração visual/PDF/STT será adicionada server-side na próxima fase.

## Segurança

- Household é a fronteira de autorização.
- Evidência original não pode ser atualizada nem excluída via cliente.
- Storage é privado e valida membership, MIME e tamanho.
- Não há credenciais no frontend além da configuração pública Firebase.
- Nenhum dado real de produção é necessário para desenvolvimento.

## Teste disponível sem dependências externas

```bash
npm run test:core
```

Esse gate compila apenas o núcleo financeiro puro e testa parser, parcelas, fingerprint/deduplicação e cálculo da Home.
