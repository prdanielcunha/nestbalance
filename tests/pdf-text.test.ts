import test from 'node:test';
import assert from 'node:assert/strict';
import { extractNativePdfText, PDF_TEXT_MAX_INPUT_BYTES } from '../server/pdf-text.js';
import { extractNativeDocumentText } from '../server/document-text.js';

function buildPdf(text:string) {
  const payload=Buffer.from(`BT /F1 12 Tf 72 720 Td (${text.replace(/([\\()])/g,'\\$1')}) Tj ET`,'latin1');
  const objects=[
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>','latin1'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>','latin1'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>','latin1'),
    Buffer.concat([Buffer.from(`<< /Length ${payload.length} >>\nstream\n`,'latin1'),payload,Buffer.from('\nendstream','latin1')]),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','latin1')
  ];
  const chunks=[Buffer.from('%PDF-1.4\n','latin1')];
  const offsets=[0];
  let length=chunks[0].length;
  objects.forEach((obj,index)=>{
    offsets[index+1]=length;
    const entry=Buffer.concat([Buffer.from(`${index+1} 0 obj\n`,'latin1'),obj,Buffer.from('\nendobj\n','latin1')]);
    chunks.push(entry); length+=entry.length;
  });
  const xref=length;
  const rows=['0000000000 65535 f ',...offsets.slice(1).map(x=>`${String(x).padStart(10,'0')} 00000 n `)];
  chunks.push(Buffer.from(`xref\n0 6\n${rows.join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,'latin1'));
  return Buffer.concat(chunks);
}

test('extrai texto nativo de PDF sem OCR ou IA', async () => {
  const result=await extractNativePdfText(buildPdf('Total R$ 123,45'));
  assert.equal(result.state,'extracted');
  if (result.state==='extracted') assert.match(result.text,/Total R\$ 123,45/);
});

test('PDF inválido falha fechado', async () => {
  const result=await extractNativePdfText(Buffer.from('<html>not pdf</html>'));
  assert.deepEqual(result,{state:'unavailable',parser:'unpdf-pdfjs-1',reason:'invalid_pdf'});
});

test('PDF acima do budget é rejeitado antes do parser', async () => {
  const bytes=Buffer.alloc(PDF_TEXT_MAX_INPUT_BYTES+1,0x20);
  bytes.write('%PDF-',0,'ascii');
  const result=await extractNativePdfText(bytes);
  assert.equal(result.state,'unavailable');
  if (result.state==='unavailable') assert.equal(result.reason,'input_too_large');
});

test('TXT é extraído deterministicamente e normalizado', async () => {
  const result=await extractNativeDocumentText(Buffer.from('Internet R$ 119,90\r\nVence 10/10/2026'),'text/plain');
  assert.equal(result.state,'extracted');
  if (result.state==='extracted') assert.match(result.text,/Internet R\$ 119,90\nVence/);
});

test('imagem é roteada para visão sem fingir leitura', async () => {
  const result=await extractNativeDocumentText(Buffer.from([0xff,0xd8,0xff]),'image/jpeg');
  assert.deepEqual(result,{state:'needs_ai',reason:'visual_input'});
});

test('áudio é roteado para STT/IA sem fingir transcrição', async () => {
  const result=await extractNativeDocumentText(Buffer.from('ID3'),'audio/mpeg');
  assert.deepEqual(result,{state:'needs_ai',reason:'audio_input'});
});
