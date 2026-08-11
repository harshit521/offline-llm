export type Theme = 'light'|'dark'
export const models = [
 {name:'Qwen3 8B',id:'qwen3:8b',size:'5.2 GB',quant:'Q4_K_M',context:'32K',status:'ACTIVE'},
 {name:'Llama 3',id:'llama3:latest',size:'4.7 GB',quant:'Q4_K_M',context:'8K',status:'READY'}
]
export const documents = [
 {name:'research-paper.pdf',type:'PDF',size:'4.2 MB',status:'INDEXED',added:'Today',pages:24,chunks:186,embedding:'all-MiniLM-L6-v2'},
 {name:'project-architecture.pdf',type:'PDF',size:'1.8 MB',status:'INDEXED',added:'Today',pages:12,chunks:94,embedding:'all-MiniLM-L6-v2'},
 {name:'requirements.md',type:'MD',size:'18 KB',status:'INDEXED',added:'Today',pages:'—',chunks:31,embedding:'all-MiniLM-L6-v2'},
 {name:'meeting-notes.docx',type:'DOCX',size:'240 KB',status:'PROCESSING',added:'Today',pages:7,chunks:52,embedding:'all-MiniLM-L6-v2'}
]
export const conversations = [
 {title:'CAP theorem explanation',time:'16:42'},
 {title:'Project architecture discussion',time:'14:21'},
 {title:'Summarize research paper',time:'11:08'},
 {title:'Local inference setup',time:'09:36'},
 {title:'ChromaDB indexing notes',time:'Yesterday'}
]
