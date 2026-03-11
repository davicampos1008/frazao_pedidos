// 1. Atualize o estado inicial para incluir o ID
const [dados, setDados] = useState({ 
  id: null, // IMPORTANTE: Campo para o Supabase reconhecer o registro existente
  nome: '', 
  codigo: '', 
  senha: '', 
  telefone: '', 
  perfil: 'operador', 
  status: true, 
  loja: '', 
  codigo_loja: null 
});

// 2. Modifique a função selecionarLoja para não sobrescrever códigos existentes
const selecionarLoja = (loja) => {
  const nomeDaLoja = loja['Nome Fantasia'] || loja.nome_fantasia || loja.Nome_Fantasia || 'LOJA DESCONHECIDA';
  const idDaLoja = loja.codigo_loja;

  if (!idDaLoja) {
    alert("Erro V.I.R.T.U.S: Loja sem 'codigo_loja' cadastrado.");
    return;
  }
  
  // SÓ GERA NOVO CÓDIGO SE NÃO TIVER ID (OU SEJA, SE FOR NOVO CADASTRO)
  if (!dados.id) {
    const prefixo = String(idDaLoja).padStart(2, '0');
    const usuariosDaLoja = usuarios.filter(u => u.codigo?.startsWith(prefixo));
    const proximoNumero = (usuariosDaLoja.length + 1).toString().padStart(2, '0');
    
    setDados({ ...dados, loja: nomeDaLoja, codigo: `${prefixo}${proximoNumero}`, codigo_loja: idDaLoja });
  } else {
    // Se for edição, apenas atualiza o nome da loja e o id da loja, mantendo o código original
    setDados({ ...dados, loja: nomeDaLoja, codigo_loja: idDaLoja });
  }
  
  setLojaDigitada(nomeDaLoja);
  setMostrarSugestoesLoja(false);
};

// 3. Certifique-se que ao clicar em "NOVO", o id seja resetado
// No seu botão + NOVO, mude para:
<button 
  onClick={() => { 
    setDados({ id: null, nome: '', codigo: '', senha: '', telefone: '', perfil: 'operador', status: true, loja: '', codigo_loja: null }); 
    setLojaDigitada(''); 
    setUsuarioAberto({novo: true}); 
    setEditando(true); 
  }}
  style={{ /* seus estilos */ }}
>
  + NOVO
</button>

// 4. Ao clicar em um usuário da lista para editar, garanta que o ID vá para o estado
// No seu map de usuários:
{usuarios.filter(u => u.nome?.toLowerCase().includes(busca.toLowerCase())).map(u => (
  <div key={u.id || u.codigo} onClick={() => { 
    setUsuarioAberto(u); 
    setDados({ ...u }); // Isso vai passar o ID, NOME, CODIGO, etc.
    setLojaDigitada(u.loja || ''); 
    setEditando(false); 
    /* ... restantes dos sets */
  }}>
  {/* ... conteúdo do card */}
  </div>
))}