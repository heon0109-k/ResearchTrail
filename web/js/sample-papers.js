'use strict';
/* Third-party PDFs: assets/papers/credits.html lists sources and licenses. */
var SAMPLE_PAPERS={
  "s1": {
    "id": "s1",
    "title": "Attention Is All You Need",
    "authors": "Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones, Aidan N. Gomez, Łukasz Kaiser, Illia Polosukhin",
    "source": "https://arxiv.org/abs/1706.03762v7",
    "license": "arXiv 비독점 배포 라이선스",
    "licenseUrl": "https://arxiv.org/licenses/nonexclusive-distrib/1.0/license.html",
    "version": "arXiv v7",
    "file": null,
    "status": "link_only",
    "note": "확인한 라이선스는 arXiv에 대한 배포 허락이며 앱의 PDF 재배포 허용을 확인하지 못해 원문 링크만 제공한다.",
    "checked": "2026-11-08",
    "evidence": "https://arxiv.org/abs/1706.03762v7"
  },
  "s2": {
    "id": "s2",
    "title": "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
    "authors": "Jacob Devlin, Ming-Wei Chang, Kenton Lee, Kristina Toutanova",
    "source": "https://aclanthology.org/N19-1423/",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "version": "NAACL 2019 출판본",
    "file": "bert-naacl2019.pdf",
    "download": "https://aclanthology.org/N19-1423.pdf",
    "evidence": "https://aclanthology.org/faq/copyright/",
    "checked": "2026-11-08",
    "sha256": "987545ffb087f1ece898142c403a516baeabeb70ce19089397fac6f7db12c3d4",
    "bytes": 786279,
    "pages": 16,
    "status": "bundled",
    "modified": false
  },
  "s3": {
    "id": "s3",
    "title": "BioBERT: a pre-trained biomedical language representation model for biomedical text mining",
    "authors": "Jinhyuk Lee, Wonjin Yoon, Sungdong Kim, Donghyeon Kim, Sunkyu Kim, Chan Ho So, Jaewoo Kang",
    "source": "https://pmc.ncbi.nlm.nih.gov/articles/PMC7703786/",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "version": "Bioinformatics 36(4), 1234–1240 출판본",
    "file": "biobert-published.pdf",
    "download": "https://pmc-oa-opendata.s3.amazonaws.com/PMC7703786.1/PMC7703786.1.pdf",
    "evidence": "https://pmc.ncbi.nlm.nih.gov/articles/PMC7703786/",
    "checked": "2026-11-08",
    "sha256": "203243fad4fa3f7507dfb1d5cf419e5f485b1f250ba1d97c4b32ab4fd9dde68e",
    "bytes": 1356825,
    "pages": 7,
    "status": "bundled",
    "modified": false
  },
  "s4": {
    "id": "s4",
    "title": "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
    "authors": "Patrick Lewis, Ethan Perez, Aleksandra Piktus, Fabio Petroni, Vladimir Karpukhin, Naman Goyal, Heinrich Küttler, Mike Lewis, Wen-tau Yih, Tim Rocktäschel, Sebastian Riedel, Douwe Kiela",
    "source": "https://arxiv.org/abs/2005.11401v4",
    "license": "arXiv 비독점 배포 라이선스",
    "licenseUrl": "https://arxiv.org/licenses/nonexclusive-distrib/1.0/license.html",
    "version": "arXiv v4",
    "file": null,
    "status": "link_only",
    "note": "확인한 라이선스는 arXiv에 대한 배포 허락이며 앱의 PDF 재배포 허용을 확인하지 못해 원문 링크만 제공한다.",
    "checked": "2026-11-08",
    "evidence": "https://arxiv.org/abs/2005.11401v4"
  },
  "s5": {
    "id": "s5",
    "title": "Large language models encode clinical knowledge",
    "authors": "Karan Singhal, Shekoofeh Azizi, Tao Tu, S. Sara Mahdavi, Jason Wei, Hyung Won Chung, Nathan Scales, Ajay Tanwani, Heather Cole-Lewis, Stephen Pfohl, Perry Payne, Martin Seneviratne, Paul Gamble, Chris Kelly, Nathaneal Scharli, Aakanksha Chowdhery, Philip Mansfield, Blaise Aguera y Arcas, Dale Webster, Greg S. Corrado, Yossi Matias, Katherine Chou, Juraj Gottweis, Nenad Tomasev, Yun Liu, Alvin Rajkomar, Joelle Barral, Christopher Semturs, Alan Karthikesalingam, Vivek Natarajan",
    "source": "https://arxiv.org/abs/2212.13138v1",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "version": "arXiv v1",
    "file": "clinical-knowledge-v1.pdf",
    "download": "https://arxiv.org/pdf/2212.13138v1",
    "checked": "2026-11-08",
    "evidence": "https://arxiv.org/abs/2212.13138v1",
    "sha256": "e83a6fecf5820a49b2b1c716f4c1839a7301300a6e27aa53c3cb7212b7db9f4e",
    "bytes": 1438481,
    "pages": 44,
    "status": "bundled",
    "modified": false
  },
  "s6": {
    "id": "s6",
    "title": "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models",
    "authors": "Jason Wei, Xuezhi Wang, Dale Schuurmans, Maarten Bosma, Brian Ichter, Fei Xia, Ed Chi, Quoc Le, Denny Zhou",
    "source": "https://arxiv.org/abs/2201.11903v6",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "version": "arXiv v6",
    "file": "chain-of-thought-v6.pdf",
    "download": "https://arxiv.org/pdf/2201.11903v6",
    "checked": "2026-11-08",
    "evidence": "https://arxiv.org/abs/2201.11903v6",
    "sha256": "7d9f878c23b460e4566aa4ec9201b1abfb3b8faefb2b1356e411cb90fef72a12",
    "bytes": 891773,
    "pages": 43,
    "status": "bundled",
    "modified": false
  },
  "s7": {
    "id": "s7",
    "title": "Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection",
    "authors": "Akari Asai, Zeqiu Wu, Yizhong Wang, Avirup Sil, Hannaneh Hajishirzi",
    "source": "https://arxiv.org/abs/2310.11511v1",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "version": "arXiv v1",
    "file": "self-rag-v1.pdf",
    "download": "https://arxiv.org/pdf/2310.11511v1",
    "checked": "2026-11-08",
    "evidence": "https://arxiv.org/abs/2310.11511v1",
    "sha256": "d9eaa1398abac0df67a9d0933a5bf8b6d9d83d2e72da2a486073cd842dd52978",
    "bytes": 1405127,
    "pages": 30,
    "status": "bundled",
    "modified": false
  },
  "s8": {
    "id": "s8",
    "title": "From Local to Global: A Graph RAG Approach to Query-Focused Summarization",
    "authors": "Darren Edge, Ha Trinh, Newman Cheng, Joshua Bradley, Alex Chao, Apurva Mody, Steven Truitt, Jonathan Larson",
    "source": "https://arxiv.org/abs/2404.16130v1",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "version": "arXiv v1",
    "file": "graphrag-v1.pdf",
    "download": "https://arxiv.org/pdf/2404.16130v1",
    "checked": "2026-11-08",
    "evidence": "https://arxiv.org/abs/2404.16130v1",
    "sha256": "33524b3b56910c513affdad8dbf67d14e68edf0572e4debdb09a9f1916463b06",
    "bytes": 6782285,
    "pages": 15,
    "status": "bundled",
    "modified": false
  },
  "s9": {
    "id": "s9",
    "title": "Almanac: Retrieval-Augmented Language Models for Clinical Medicine",
    "authors": "Cyril Zakka, Akash Chaurasia, Rohan Shad, Alex R. Dalal, Jennifer L. Kim, Michael Moor, Kevin Alexander, Euan Ashley, Jack Boyd, Kathleen Boyd, Karen Hirsch, Curt Langlotz, Joanna Nelson, William Hiesinger",
    "source": "https://arxiv.org/abs/2303.01229v2",
    "license": "CC BY-NC-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-nc-sa/4.0/",
    "version": "arXiv v2",
    "file": "almanac-v2.pdf",
    "download": "https://arxiv.org/pdf/2303.01229v2",
    "note": "비상업적 수업 MVP 체험에 사용한다. PDF는 변경하지 않았으며 수정·재배포 시 이 파일의 비영리·동일조건변경허락 조건을 따른다.",
    "checked": "2026-11-08",
    "evidence": "https://arxiv.org/abs/2303.01229v2",
    "sha256": "0d35166b833138cb0fb734128e1331a6cae3469d7f8119cf5920ea9a5b189349",
    "bytes": 2711518,
    "pages": 26,
    "status": "bundled",
    "modified": false
  }
};
function samplePaper(p){
  if(!p||typeof S==='undefined'||!S.example)return null;
  var entry=SAMPLE_PAPERS[p.id];
  return entry&&entry.title===p.title?entry:null;
}
function samplePdfUrl(p){
  var entry=samplePaper(p);
  return entry&&entry.file&&!p.pdf&&p.link===entry.source?'assets/papers/'+entry.file:null;
}
function sampleSourceHtml(p){
  var e=samplePaper(p);if(!e)return '';
  var original=!p.pdf&&p.link===e.source;
  return '<details class="reader-extra sample-source"><summary>예시 논문 출처·이용 조건</summary><p>'+esc(e.title)+'</p><p>'+esc(e.authors)+'</p><p>'+esc(e.version)+' · <a href="'+esc(e.source)+'" target="_blank" rel="noopener">원문</a> · <a href="'+esc(e.licenseUrl)+'" target="_blank" rel="noopener">'+esc(e.license)+'</a></p><p>'+(original&&e.file?'앱에 포함한 PDF는 원문 그대로입니다.':original?'이 논문은 원문 링크로 제공합니다.':'현재 첨부·링크는 사용자가 변경했습니다. 아래 출처는 최초 예시 자료 기준입니다.')+'</p><p>예시 메모·다음 할 일·하이라이트는 ResearchTrail 팀의 체험용 기록이며, 논문 저자의 작성·보증을 의미하지 않습니다.</p><a href="assets/papers/credits.html" target="_blank" rel="noopener">전체 예시 논문 출처 보기</a></details>';
}
