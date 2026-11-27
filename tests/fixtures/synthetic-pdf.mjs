// A complete single-page synthetic PDF with an xref table, independent of the bundled papers.
export function syntheticPdf() {
  const stream = 'BT /F1 16 Tf 32 150 Td (ResearchTrail PDF fixture) Tj ET\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length '+stream.length+' >>\nstream\n'+stream+'endstream',
  ];
  let data = '%PDF-1.4\n';
  const offsets = [];
  for (const [index,object] of objects.entries()) {
    offsets.push(data.length);
    data += (index+1)+' 0 obj\n'+object+'\nendobj\n';
  }
  const xref = data.length;
  data += 'xref\n0 6\n0000000000 65535 f \n';
  for (const offset of offsets) data += String(offset).padStart(10,'0')+' 00000 n \n';
  data += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
  return new TextEncoder().encode(data);
}
