import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function FechamentoCliente({ isEscuro }) { 
  const [carregando, setCarregando] = useState(true);
  const [perfil, setPerfil] = useState(null); // { role, loja_id }
  const [lojasLiberadas, setLojasLiberadas] = useState([]); 
  const [lojaSelecionada, setLojaSelecionada] = useState('');
  const [dadosFechamento, setDadosFechamento] = useState(null);
  
  const [statusFechamento, setStatusFechamento] = useState('');
  
  // Obtém a data local atual
  const obterDataLocal = () => {
    const data = new Date();
    const tzOffset = data.getTimezoneOffset() * 60000;
    return new Date(data.getTime() - tzOffset).toISOString().split('T')[0];
  };

  // 💡 NOVA LÓGICA DE DATAS: Subtrai 1 dia da data selecionada
  const obterDataAnterior = (dataString) => {
    if (!dataString) return '';
    const dateObj = new Date(dataString + 'T12:00:00'); // Evita bugs de fuso horário
    dateObj.setDate(dateObj.getDate() - 1);
    return dateObj.toISOString().split('T')[0];
  };

  const [dataVisivel, setDataVisivel] = useState(obterDataLocal());

  const configDesign = {
    cores: {
      fundoGeral: isEscuro ? '#0f172a' : '#f8fafc',
      fundoCards: isEscuro ? '#1e293b' : '#ffffff',
      textoForte: isEscuro ? '#f8fafc' : '#111111',
      textoSuave: isEscuro ? '#94a3b8' : '#64748b',
      borda: isEscuro ? '#334155' : '#e2e8f0',
      primaria: '#8b5cf6',
      sucesso: '#22c55e',
      alerta: '#ef4444',
      aviso: '#f59e0b',
      info: '#3b82f6',
      inputFundo: isEscuro ? '#0f172a' : '#f1f5f9'
    }
  };

  useEffect(() => {
    carregarPerfil();
  }, []);

  useEffect(() => {
    if (perfil) carregarDados();
  }, [perfil, dataVisivel, lojaSelecionada]);

  // Alerta de cobrança externa
  useEffect(() => {
    if (dadosFechamento && statusFechamento !== 'PAGO' && statusFechamento !== '') {
      const horaAtual = new Date().getHours();
      const keyAlerta = `alerta_cobranca_${dataVisivel}_14h`;
      
      if (horaAtual === 14 && !sessionStorage.getItem(keyAlerta)) {
        const msgExterna = `🔔 Frazão Frutas & Cia: O pagamento do fechamento (Entrega: ${dataBr(dataVisivel)}) ainda não consta como concluído.`;
        
        alert(`🔔 AVISO FINANCEIRO:\n\nConsta em nosso sistema que o pagamento do fechamento (Entrega: ${dataBr(dataVisivel)}) ainda não foi concluído. Por favor, regularize e avise o setor financeiro!`);
        
        if ("Notification" in window) {
            if (Notification.permission === "granted") {
                new Notification("Cobrança Pendente", { body: msgExterna });
            } else if (Notification.permission !== "denied") {
                Notification.requestPermission().then(permission => {
                    if (permission === "granted") {
                        new Notification("Cobrança Pendente", { body: msgExterna });
                    }
                });
            }
        }
        
        sessionStorage.setItem(keyAlerta, 'true');
      }
    }
  }, [dadosFechamento, statusFechamento, dataVisivel]);

  async function carregarPerfil() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: perfilData } = await supabase
        .from('perfis')
        .select('role, loja_id')
        .eq('id', user.id)
        .single();

      setPerfil(perfilData);
      if (perfilData?.role === 'cliente') {
        setLojaSelecionada(perfilData.loja_id);
      }
    } catch (err) {
      console.error("Erro ao carregar perfil:", err);
    }
  }

  async function carregarDados() {
    setCarregando(true);
    try {
      if (perfil?.role === 'admin') {
        const { data: lojas } = await supabase.from('lojas').select('codigo_loja, nome_fantasia');
        setLojasLiberadas(lojas || []);
        
        // 💡 SE FOR ADMIN E NÃO TIVER LOJA SELECIONADA, PARA A BUSCA AQUI
        if (!lojaSelecionada) {
          setDadosFechamento(null);
          setStatusFechamento('');
          setCarregando(false);
          return;
        }
      }

      const dataBusca = obterDataAnterior(dataVisivel);

      let query = supabase
        .from('pedidos')
        .select('*')
        .eq('data_pedido', dataBusca);

      if (perfil?.role === 'cliente') {
        query = query.eq('loja_id', perfil.loja_id);
      } else if (lojaSelecionada) {
        query = query.eq('loja_id', lojaSelecionada);
      }

      const { data: pedidos } = await query;

      // 💡 NÃO disponibilizar se estiver pendente
      const pedidosFiltrados = (pedidos || []).filter(p => {
        const s = (p.status_fechamento || '').toUpperCase();
        return s !== 'PENDENTE' && s !== 'PENDENCIA';
      });

      processarPedidos(pedidosFiltrados);
    } catch (err) {
      console.error(err);
    } finally {
      setCarregando(false);
    }
  }

  const formatarMoeda = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const processarPedidos = (pedidos) => {
    if (pedidos.length === 0) {
      setDadosFechamento(null);
      setStatusFechamento('');
      return;
    }

    setStatusFechamento((pedidos[0].status_fechamento || 'ENVIADO').toUpperCase());

    const itensProcessados = pedidos.map(p => {
      const valorRaw = p.preco_venda || p.custo_unit || 'R$ 0,00';
      let displayPreco = valorRaw;
      let numPreco = 0;
      let statusItem = 'OK';

      if (p.status_compra === 'falta') {
        displayPreco = 'FALTA';
        statusItem = 'FALTA';
      } else if (p.status_compra === 'boleto') {
        displayPreco = 'BOLETO';
        statusItem = 'BOLETO';
      } else {
        const pLimpo = String(valorRaw).replace('BONIFICAÇÃO |', '').replace('R$', '').trim();
        numPreco = parseFloat(pLimpo.replace(/\./g, '').replace(',', '.')) || 0;
        displayPreco = formatarMoeda(numPreco);
      }

      const qtd = Number(p.qtd_atendida || p.quantidade || 0);
      return {
        nome: p.nome_produto,
        qtd,
        und: p.unidade_medida || 'UN',
        unitario: displayPreco,
        total: numPreco * qtd,
        status: statusItem
      };
    });

    const totalGeral = itensProcessados.reduce((acc, i) => acc + i.total, 0);
    setDadosFechamento({
      itens: itensProcessados,
      totalGeral
    });
  };

  const imprimirPDF = () => {
      window.print();
  };

  // 💡 LÓGICA DE CÓPIA LIVRE PARA PLANILHAS
  const copiarDados = (tipo) => {
    if (!dadosFechamento) return;

    let texto = '';
    const itens = dadosFechamento.itens;

    switch(tipo) {
      case 'planilha_completa':
        // Tabulação (\t) faz cada dado cair em uma coluna diferente no Excel
        texto = itens.map(i => `${i.qtd}\t${i.nome}\t${i.unitario}\t${i.status === 'OK' ? formatarMoeda(i.total) : i.status}`).join('\n');
        break;
      case 'texto_resumo':
        texto = itens.map(i => `${i.qtd}x ${i.nome} | Unit: ${i.unitario} | Total: ${i.status === 'OK' ? formatarMoeda(i.total) : i.status}`).join('\n');
        break;
      case 'col_qtd':
        texto = itens.map(i => i.qtd).join('\n');
        break;
      case 'col_desc':
        texto = itens.map(i => i.nome).join('\n');
        break;
      case 'col_unit':
        texto = itens.map(i => i.unitario).join('\n');
        break;
      case 'col_total':
        texto = itens.map(i => i.status === 'OK' ? formatarMoeda(i.total) : i.status).join('\n');
        break;
      default:
        break;
    }

    navigator.clipboard.writeText(texto).then(() => {
      alert('Copiado com sucesso! Agora é só colar.');
    }).catch(() => {
      alert('Erro ao copiar os dados.');
    });
  };

  // Configuração visual da Label de Status do Fechamento
  const renderStatusBadge = () => {
    let corBg = configDesign.cores.info;
    let icone = '📌';
    let texto = statusFechamento;

    if (statusFechamento === 'PAGO') {
      corBg = configDesign.cores.sucesso;
      icone = '✅';
    } else if (statusFechamento === 'ENVIADO') {
      corBg = configDesign.cores.aviso;
      icone = '📤';
    }

    return (
      <div style={{ backgroundColor: corBg, color: '#fff', padding: '15px', borderRadius: '12px', textAlign: 'center', fontWeight: '900', marginBottom: '20px', boxShadow: `0 4px 15px ${corBg}40`, letterSpacing: '1px' }}>
        {icone} STATUS DO FECHAMENTO: {texto}
      </div>
    );
  };

  const btnCopiaEstilo = {
    padding: '8px 12px',
    backgroundColor: 'transparent',
    border: `1px solid ${configDesign.cores.borda}`,
    color: configDesign.cores.textoForte,
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
    transition: 'all 0.2s ease',
  };

  return (
    <div style={{ backgroundColor: configDesign.cores.fundoGeral, minHeight: '100vh', padding: '20px', fontFamily: 'sans-serif' }}>
      
      {/* HEADER E FILTROS */}
      <div style={{ maxWidth: '900px', margin: '0 auto 25px auto', backgroundColor: configDesign.cores.fundoCards, padding: '25px', borderRadius: '20px', border: `1px solid ${configDesign.cores.borda}`, boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <h2 style={{ margin: 0, color: configDesign.cores.textoForte, fontSize: '22px' }}>
              {perfil?.role === 'admin' ? '📑 Visualização Administrativa' : '🏪 Nota Fiscal da Loja'}
            </h2>
            <p style={{ margin: '5px 0 0 0', color: configDesign.cores.textoSuave, fontSize: '13px' }}>
              Mostrando o fechamento do <strong>dia anterior</strong> à data da entrega.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: configDesign.cores.textoSuave }}>Data da Entrega:</span>
            <input 
              type="date" 
              value={dataVisivel} 
              onChange={(e) => setDataVisivel(e.target.value)}
              style={{ padding: '10px', borderRadius: '10px', border: `1px solid ${configDesign.cores.borda}`, fontWeight: 'bold', outline: 'none' }}
            />
            {perfil?.role === 'admin' && (
              <select 
                value={lojaSelecionada} 
                onChange={(e) => setLojaSelecionada(e.target.value)}
                style={{ padding: '10px', borderRadius: '10px', border: `1px solid ${configDesign.cores.borda}`, fontWeight: 'bold', outline: 'none' }}
              >
                <option value="">Selecione a Loja...</option>
                {lojasLiberadas.map(l => (
                  <option key={l.codigo_loja} value={l.codigo_loja}>{l.nome_fantasia}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {carregando ? (
        <div style={{ textAlign: 'center', padding: '50px', color: configDesign.cores.textoSuave }}>🔄 Buscando dados liberados...</div>
      ) : perfil?.role === 'admin' && !lojaSelecionada ? (
        // 💡 TELA DE AVISO PARA O ADMIN ESCOLHER A LOJA
        <div style={{ textAlign: 'center', padding: '60px', backgroundColor: configDesign.cores.fundoCards, borderRadius: '20px', maxWidth: '900px', margin: '0 auto', border: `1px dashed ${configDesign.cores.borda}` }}>
           <span style={{ fontSize: '50px' }}>🏪</span>
           <h3 style={{ color: configDesign.cores.textoForte }}>Selecione uma loja</h3>
           <p style={{ color: configDesign.cores.textoSuave }}>Escolha uma loja no menu acima para visualizar o fechamento específico dela igual à visão do cliente.</p>
        </div>
      ) : !dadosFechamento ? (
        <div style={{ textAlign: 'center', padding: '60px', backgroundColor: configDesign.cores.fundoCards, borderRadius: '20px', maxWidth: '900px', margin: '0 auto', border: `1px dashed ${configDesign.cores.borda}` }}>
           <span style={{ fontSize: '50px' }}>⏳</span>
           <h3 style={{ color: configDesign.cores.textoForte }}>Nenhum fechamento liberado</h3>
           <p style={{ color: configDesign.cores.textoSuave }}>Seu fechamento ainda está pendente ou não há registros para o dia anterior a esta data.</p>
        </div>
      ) : (
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          
          {/* 💡 ALERTA VISUAL IDENTIFICANDO A SITUAÇÃO */}
          {renderStatusBadge()}

          {/* CARD PRINCIPAL */}
          <div id="area-nota-cliente" style={{ backgroundColor: configDesign.cores.fundoCards, borderRadius: '20px', border: `1px solid ${configDesign.cores.borda}`, overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
            
            {/* TOPO DA NOTA */}
            <div style={{ padding: '30px', backgroundColor: isEscuro ? '#0f172a' : '#f1f5f9', borderBottom: `1px solid ${configDesign.cores.borda}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '15px' }}>
              <div>
                <span style={{ fontSize: '12px', fontWeight: '900', color: configDesign.cores.primaria, textTransform: 'uppercase', letterSpacing: '1px' }}>Resumo Financeiro</span>
                <h1 style={{ margin: '5px 0 0 0', color: configDesign.cores.textoForte, fontSize: '28px', fontWeight: '900' }}>{formatarMoeda(dadosFechamento.totalGeral)}</h1>
                <p style={{ margin: '5px 0 0 0', color: configDesign.cores.textoSuave, fontSize: '13px' }}>
                  Referente às compras do dia: <strong>{dataBr(obterDataAnterior(dataVisivel))}</strong>
                </p>
              </div>
              <button onClick={imprimirPDF} style={{ background: configDesign.cores.textoForte, color: isEscuro ? '#000' : '#fff', border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
                📄 GERAR PDF
              </button>
            </div>

            {/* 💡 MENU DE OPÇÕES DE CÓPIA */}
            <div style={{ padding: '20px', borderBottom: `1px solid ${configDesign.cores.borda}`, backgroundColor: configDesign.cores.fundoGeral }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: configDesign.cores.textoSuave, marginBottom: '10px' }}>📋 COPIAR DADOS:</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button style={btnCopiaEstilo} onClick={() => copiarDados('planilha_completa')}>Tudo (Para Planilha)</button>
                <button style={btnCopiaEstilo} onClick={() => copiarDados('texto_resumo')}>Tudo (Para WhatsApp)</button>
                <span style={{ width: '1px', backgroundColor: configDesign.cores.borda, margin: '0 5px' }}></span>
                <button style={btnCopiaEstilo} onClick={() => copiarDados('col_qtd')}>Só QTD</button>
                <button style={btnCopiaEstilo} onClick={() => copiarDados('col_desc')}>Só Descrição</button>
                <button style={btnCopiaEstilo} onClick={() => copiarDados('col_unit')}>Só Unitário</button>
                <button style={btnCopiaEstilo} onClick={() => copiarDados('col_total')}>Só Total</button>
              </div>
            </div>

            {/* 💡 LISTA DE ITENS EM UMA COLUNA SÓ */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {dadosFechamento.itens.map((item, idx) => (
                <div key={idx} style={{ padding: '15px', borderRadius: '12px', border: `1px solid ${configDesign.cores.borda}`, backgroundColor: item.status !== 'OK' ? (isEscuro ? '#331a1a' : '#fff1f1') : (isEscuro ? '#0f172a' : '#ffffff') }}>
                  
                  {/* Linha Superior: Nome e Quantidade */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div style={{ fontSize: '15px', fontWeight: 'bold', color: configDesign.cores.textoForte }}>
                      {item.nome}
                    </div>
                    <div style={{ backgroundColor: configDesign.cores.fundoGeral, padding: '4px 10px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', color: configDesign.cores.textoSuave, border: `1px solid ${configDesign.cores.borda}`, whiteSpace: 'nowrap', marginLeft: '10px' }}>
                      {item.qtd} {item.und}
                    </div>
                  </div>

                  {/* Linha Inferior: Valores (Com pontilhado de separação) */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px dashed ${configDesign.cores.borda}`, paddingTop: '10px' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: configDesign.cores.textoSuave, textTransform: 'uppercase' }}>Valor Unit.</div>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: item.status === 'FALTA' ? configDesign.cores.alerta : item.status === 'BOLETO' ? configDesign.cores.aviso : configDesign.cores.textoSuave }}>
                        {item.unitario}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '11px', color: configDesign.cores.textoSuave, textTransform: 'uppercase' }}>Total</div>
                      <div style={{ fontSize: '16px', fontWeight: '900', color: configDesign.cores.textoForte }}>
                        {item.status === 'OK' ? formatarMoeda(item.total) : item.status}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* RODAPÉ DA NOTA */}
            <div style={{ padding: '20px 30px', backgroundColor: isEscuro ? '#1e293b' : '#fafafa', borderTop: `1px solid ${configDesign.cores.borda}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
               <div style={{ fontSize: '12px', color: configDesign.cores.textoSuave }}>
                  Dúvidas sobre os valores? Entre em contato com o financeiro.
               </div>
               <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '11px', color: configDesign.cores.textoSuave, display: 'block' }}>Data da Entrega Selecionada</span>
                  <strong style={{ color: configDesign.cores.textoForte }}>{dataBr(dataVisivel)}</strong>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function dataBr(data) {
    if (!data) return '';
    return data.split('-').reverse().join('/');
  }
}