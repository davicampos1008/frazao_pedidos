import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

// 💡 ADICIONADO O PARÂMETRO 'usuario' QUE VEM LÁ DO APP.JSX
export default function FechamentoCliente({ isEscuro, usuario }) { 
  const [carregando, setCarregando] = useState(true);
  const [perfil, setPerfil] = useState(null); // { role, loja_id }
  const [lojasLiberadas, setLojasLiberadas] = useState([]); 
  const [lojaSelecionada, setLojaSelecionada] = useState('');
  const [dadosFechamento, setDadosFechamento] = useState(null);
  
  const [statusFechamento, setStatusFechamento] = useState('');
  const [modoVisao, setModoVisao] = useState('lista'); // 💡 ESTADO PARA CONTROLAR A TIPO DE VISAO ('lista' ou 'detalhada')
  
  // Obtém a data local atual
  const obterDataLocal = () => {
    const data = new Date();
    const tzOffset = data.getTimezoneOffset() * 60000;
    return new Date(data.getTime() - tzOffset).toISOString().split('T')[0];
  };

  // NOVA LÓGICA DE DATAS: Subtrai 1 dia da data selecionada
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
      sucesso: '#16a34a', // Verde Bonificação
      alerta: '#ef4444',  // Vermelho Falta
      aviso: '#d97706',   // Dourado Boleto
      info: '#3b82f6',
      inputFundo: isEscuro ? '#0f172a' : '#f1f5f9'
    }
  };

  // Função para definir a cor de fundo da linha/card baseada no status seguindo o modelo do boleto
  const obterCorFundoStatus = (status, escuro) => {
    if (status === 'FALTA') return escuro ? '#331a1a' : '#fff1f1'; // Vermelho sutil
    if (status === 'BONIFICAÇÃO' || status === 'BONIF. PARCIAL') return escuro ? '#14331e' : '#f1fff4'; // Verde sutil
    if (status === 'BOLETO') return escuro ? '#332414' : '#fff8f1'; // Dourado/Marrom sutil
    return 'transparent';
  };

  useEffect(() => {
    carregarPerfil();
  }, []);

  useEffect(() => {
    if (perfil) carregarDados();
  }, [perfil, dataVisivel, lojaSelecionada]);

  // Alerta de cobrança externa
  useEffect(() => {
    if (dadosFechamento && statusFechamento !== 'PAGO' && statusFechamento !== '' && statusFechamento !== 'AGUARDANDO') {
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

  // CORREÇÃO PRINCIPAL: Buscando o perfil diretamente do seu sistema de login
  async function carregarPerfil() {
    try {
      const usuarioAtual = usuario || JSON.parse(localStorage.getItem('usuarioVIRTUS'));
      
      if (!usuarioAtual) {
        setCarregando(false);
        return;
      }

      const role = usuarioAtual.perfil;
      const loja_id = usuarioAtual.loja_id || usuarioAtual.codigo_loja || usuarioAtual.loja;

      setPerfil({ role, loja_id });
      
      if (role === 'cliente') {
        setLojaSelecionada(loja_id);
      }
    } catch (err) {
      console.error("Erro ao carregar perfil:", err);
      setCarregando(false);
    }
  }

  async function carregarDados() {
    setCarregando(true);
    try {
      if (perfil?.role === 'admin') {
        const { data: lojas } = await supabase.from('lojas').select('codigo_loja, nome_fantasia');
        setLojasLiberadas(lojas || []);
        
        // SE FOR ADMIN E NÃO TIVER LOJA SELECIONADA, PARA A BUSCA AQUI
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

      // NÃO disponibilizar se o fechamento for bloqueado
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

  const tratarPrecoNum = (p) => {
    if (!p || typeof p !== 'string') return 0;
    const strClean = String(p).replace('R$', '').trim().replace(/\./g, '').replace(',', '.');
    return parseFloat(strClean) || 0;
  };

  const processarPedidos = (pedidos) => {
    if (pedidos.length === 0) {
      setDadosFechamento(null);
      setStatusFechamento('');
      return;
    }

    // O padrão é 'AGUARDANDO' caso o status_fechamento esteja vazio
    setStatusFechamento((pedidos[0].status_fechamento || 'AGUARDANDO').toUpperCase());

    const itensProcessados = pedidos.map(p => {
      const isFalta = p.status_compra === 'falta' || p.qtd_atendida === 0;
      const isBoleto = p.status_compra === 'boleto';
      const qtdBonificada = Number(p.qtd_bonificada) || 0;
      
      let unitParaLoja = p.preco_venda || p.custo_unit || 'R$ 0,00';
      let precoOriginal = unitParaLoja;

      if (String(unitParaLoja).includes('BONIFICAÇÃO |')) {
         precoOriginal = unitParaLoja.split('|')[1] ? unitParaLoja.split('|')[1].trim() : 'R$ 0,00';
      }

      const numPreco = tratarPrecoNum(precoOriginal);
      let qtdDisplay = isFalta ? p.quantidade : (p.qtd_atendida || p.quantidade || 0);
      
      let displayPreco = formatarMoeda(numPreco);
      let totalItem = 0;
      let statusItem = 'OK';
      let detalhe = '';

      // 💡 APLICAÇÃO DO PADRÃO IGUAL AO FECHAMENTO LOJA (ADMIN)
      if (isFalta) {
        displayPreco = 'FALTA';
        statusItem = 'FALTA';
        totalItem = 0;
        detalhe = `Faltaram: ${p.quantidade} un | Valor Descontado: ${formatarMoeda(numPreco * p.quantidade)}`;
      } else if (isBoleto) {
        displayPreco = 'BOLETO';
        statusItem = 'BOLETO';
        totalItem = 0;
      } else {
        // Fluxo Atendido ou Bonificado
        const restCobrado = Math.max(0, qtdDisplay - qtdBonificada);
        totalItem = restCobrado * numPreco;

        if (qtdBonificada > 0) {
          if (qtdBonificada >= qtdDisplay) {
            displayPreco = 'BONIFIC.';
            statusItem = 'BONIFICAÇÃO';
            totalItem = 0;
            detalhe = `Qtd Bonificada: ${qtdBonificada} un | Paga: 0 | Economizado: ${formatarMoeda(qtdDisplay * numPreco)}`;
          } else {
            displayPreco = `${qtdBonificada} = BONIFIC.`;
            statusItem = 'BONIFICAÇÃO_PARCIAL';
            detalhe = `Qtd Bonificada: ${qtdBonificada} un | Paga: ${restCobrado} un | Valor Pago: ${formatarMoeda(totalItem)} | Economizado: ${formatarMoeda(qtdBonificada * numPreco)}`;
          }
        }
      }

      return {
        nome: p.nome_produto,
        qtd: qtdDisplay,
        und: p.unidade_medida || 'UN',
        unitario: displayPreco,
        total: totalItem,
        status: statusItem,
        detalhe
      };
    });

    const totalGeral = itensProcessados.reduce((acc, i) => acc + i.total, 0);
    setDadosFechamento({
      itens: itensProcessados,
      totalGeral
    });
  };

  // 💡 FORMATO DE PDF ATUALIZADO COM AS INFOS DA LOJA E DATA DO FECHAMENTO
  const imprimirPDF = () => {
    if (!dadosFechamento) return;
    
    const nomeDaLoja = perfil?.role === 'admin' 
       ? (lojasLiberadas.find(l => String(l.codigo_loja) === String(lojaSelecionada))?.nome_fantasia || 'Loja') 
       : (usuario?.nome_fantasia || usuario?.nome || 'Sua Loja');

    const janela = window.open('', '', 'width=800,height=600');
    janela.document.write(`
      <html>
        <head>
          <title>Fechamento - ${dataBr(dataVisivel)}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; color: #000; background: #fff; }
            h2 { margin-top: 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #000; padding: 8px; text-align: left; font-size: 14px; }
            th { background-color: #f0f0f0; }
            .right { text-align: right; }
            .center { text-align: center; }
            .total { font-size: 18px; font-weight: bold; margin-top: 20px; text-align: right; }
            .header-info { margin-bottom: 20px; }
            .detalhe { font-size: 11px; font-weight: normal; color: #555; display: block; margin-top: 4px; }
          </style>
        </head>
        <body>
          <h2>Nota Fiscal - ${nomeDaLoja}</h2>
          <div class="header-info">
            <p><strong>Data do Fechamento (Compras):</strong> ${dataBr(obterDataAnterior(dataVisivel))}</p>
            <p><strong>Data da Entrega (Vencimento):</strong> ${dataBr(dataVisivel)}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th class="center">Qtd</th>
                <th class="right">Unitário</th>
                <th class="right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${dadosFechamento.itens.map(i => `
                <tr>
                  <td>${i.nome}</td>
                  <td class="center">${i.qtd} ${i.und}</td>
                  <td class="right">${i.unitario}</td>
                  <td class="right">
                    ${(i.status === 'OK' || i.status === 'BONIFICAÇÃO_PARCIAL') ? formatarMoeda(i.total) : `<strong>${i.status}</strong>`}
                    ${(i.status === 'FALTA' || i.status === 'BONIFICAÇÃO' || i.status === 'BONIFICAÇÃO_PARCIAL') ? `<span class="detalhe">${i.detalhe}</span>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="total">Total Geral: ${formatarMoeda(dadosFechamento.totalGeral)}</div>
        </body>
      </html>
    `);
    janela.document.close();
    janela.focus();
    setTimeout(() => {
      janela.print();
      janela.close();
    }, 250);
  };

  // LÓGICA DE CÓPIA LIVRE PARA PLANILHAS
  const copiarDados = (tipo) => {
    if (!dadosFechamento) return;

    let texto = '';
    const itens = dadosFechamento.itens;

    switch(tipo) {
      case 'planilha_completa':
        texto = itens.map(i => `${i.qtd}\t${i.nome}\t${i.unitario}\t${i.status === 'OK' || i.status === 'BONIFICAÇÃO_PARCIAL' ? formatarMoeda(i.total) : i.status}`).join('\n');
        break;
      case 'texto_resumo':
        texto = itens.map(i => `${i.qtd}x ${i.nome} | Unit: ${i.unitario} | Total: ${i.status === 'OK' || i.status === 'BONIFICAÇÃO_PARCIAL' ? formatarMoeda(i.total) : i.status}`).join('\n');
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
        texto = itens.map(i => i.status === 'OK' || i.status === 'BONIFICAÇÃO_PARCIAL' ? formatarMoeda(i.total) : i.status).join('\n');
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
    let subTexto = '';

    if (statusFechamento === 'PAGO') {
      corBg = configDesign.cores.sucesso;
      icone = '✅';
      subTexto = 'Tudo certo com este fechamento. Pagamento recebido!';
    } else if (statusFechamento === 'PAGAMENTO PENDENTE' || statusFechamento === 'FALTA PAGAMENTO') {
      corBg = configDesign.cores.alerta;
      icone = '🚨';
      subTexto = 'Existe uma cobrança aguardando seu pagamento. Por favor, regularize!';
    } else if (statusFechamento === 'COBRADO') {
      corBg = '#8b5cf6'; // Violeta cobrança
      icone = '🔔';
      subTexto = 'A cobrança deste fechamento já foi enviada. Estamos aguardando confirmação.';
    } else if (statusFechamento === 'PENDÊNCIA NO PAGAMENTO' || statusFechamento === 'PENDENCIA NO PAGAMENTO') {
      corBg = '#f97316'; // Laranja pendência
      icone = '⚠️';
      subTexto = 'Há uma pendência financeira neste fechamento. Verifique com o atendimento.';
    } else if (statusFechamento === 'ENVIADO') {
      corBg = configDesign.cores.primaria;
      icone = '📤';
      subTexto = 'Fechamento liberado para sua visualização.';
    }

    return (
      <div style={{ backgroundColor: corBg, color: '#fff', padding: '15px', borderRadius: '12px', textAlign: 'center', marginBottom: '20px', boxShadow: `0 4px 15px ${corBg}40`, letterSpacing: '1px' }}>
        <div style={{ fontWeight: '900', fontSize: '16px' }}>{icone} STATUS DO FECHAMENTO: {texto}</div>
        {subTexto && <div style={{ fontSize: '13px', marginTop: '6px', fontWeight: 'bold', opacity: 0.9 }}>{subTexto}</div>}
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

  const btnVisaoEstilo = {
    padding: '8px 20px',
    borderRadius: '10px',
    border: `1px solid ${configDesign.cores.borda}`,
    fontWeight: 'bold',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
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
              style={{ padding: '10px', borderRadius: '10px', border: `1px solid ${configDesign.cores.borda}`, fontWeight: 'bold', outline: 'none', backgroundColor: configDesign.cores.fundoCards, color: configDesign.cores.textoForte }}
            />
            {perfil?.role === 'admin' && (
              <select 
                value={lojaSelecionada} 
                onChange={(e) => setLojaSelecionada(e.target.value)}
                style={{ padding: '10px', borderRadius: '10px', border: `1px solid ${configDesign.cores.borda}`, fontWeight: 'bold', outline: 'none', backgroundColor: configDesign.cores.fundoCards, color: configDesign.cores.textoForte }}
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
      ) : statusFechamento === 'AGUARDANDO' ? ( // 💡 BLOQUEIO DO ESTADO "AGUARDANDO"
        <div style={{ textAlign: 'center', padding: '60px', backgroundColor: configDesign.cores.fundoCards, borderRadius: '20px', maxWidth: '900px', margin: '0 auto', border: `1px dashed ${configDesign.cores.borda}` }}>
           <span style={{ fontSize: '50px' }}>🚧</span>
           <h3 style={{ color: configDesign.cores.textoForte }}>Fechamento em Preparação</h3>
           <p style={{ color: configDesign.cores.textoSuave }}>O fechamento desta data está marcado como AGUARDANDO liberação pela administração.</p>
        </div>
      ) : (
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          
          {/* ALERTA VISUAL IDENTIFICANDO A SITUAÇÃO */}
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

            {/* MENU DE OPÇÕES DE CÓPIA E MODO DE VISÃO */}
            <div style={{ padding: '20px', borderBottom: `1px solid ${configDesign.cores.borda}`, backgroundColor: configDesign.cores.fundoGeral }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
                
                {/* Lado Esquerdo - Copiar */}
                <div>
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

                {/* Lado Direito - Mudar Visão */}
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', color: configDesign.cores.textoSuave, marginBottom: '10px', textAlign: 'right' }}>👁️ MODO DE VISÃO:</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      onClick={() => setModoVisao('lista')} 
                      style={{...btnVisaoEstilo, backgroundColor: modoVisao === 'lista' ? configDesign.cores.primaria : 'transparent', color: modoVisao === 'lista' ? '#fff' : configDesign.cores.textoForte}}
                    >
                      Tabela / Lista
                    </button>
                    <button 
                      onClick={() => setModoVisao('detalhada')} 
                      style={{...btnVisaoEstilo, backgroundColor: modoVisao === 'detalhada' ? configDesign.cores.primaria : 'transparent', color: modoVisao === 'detalhada' ? '#fff' : configDesign.cores.textoForte}}
                    >
                      Detalhada
                    </button>
                  </div>
                </div>

              </div>
            </div>

            {/* 💡 ÁREA DINÂMICA (Renderiza Lista ou Detalhes) */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', overflowX: 'auto' }}>
              
              {modoVisao === 'lista' ? (
                // =============== MODO LISTA / TABELA ===============
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${configDesign.cores.borda}`, color: configDesign.cores.textoSuave, fontSize: '12px' }}>
                      <th style={{ padding: '12px' }}>PRODUTO</th>
                      <th style={{ padding: '12px', textAlign: 'center' }}>QTD</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>UNITÁRIO</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dadosFechamento.itens.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: `1px solid ${configDesign.cores.borda}`, backgroundColor: obterCorFundoStatus(item.status, isEscuro) }}>
                        <td style={{ padding: '12px', fontSize: '14px', fontWeight: 'bold', color: configDesign.cores.textoForte }}>{item.nome}</td>
                        <td style={{ padding: '12px', fontSize: '14px', color: configDesign.cores.textoSuave, textAlign: 'center' }}>{item.qtd} {item.und}</td>
                        <td style={{ padding: '12px', fontSize: '14px', color: item.status === 'FALTA' ? configDesign.cores.alerta : (item.status === 'BONIFICAÇÃO' || item.status === 'BONIF. PARCIAL') ? configDesign.cores.sucesso : item.status === 'BOLETO' ? configDesign.cores.aviso : configDesign.cores.textoSuave, textAlign: 'right', fontWeight: 'bold' }}>
                          {item.unitario}
                        </td>
                        <td style={{ padding: '12px', fontSize: '14px', fontWeight: '900', color: item.status === 'FALTA' ? configDesign.cores.alerta : item.status === 'BONIFICAÇÃO' ? configDesign.cores.sucesso : item.status === 'BOLETO' ? configDesign.cores.aviso : configDesign.cores.textoForte, textAlign: 'right' }}>
                          {item.status === 'OK' || item.status === 'BONIFICAÇÃO_PARCIAL' ? formatarMoeda(item.total) : (
                            <div>
                              <span>
                                {item.status === 'BONIFICAÇÃO_PARCIAL' ? 'BONIFIC. PARCIAL' : item.status}
                              </span>
                              {(item.status === 'FALTA' || item.status === 'BONIFICAÇÃO' || item.status === 'BONIFICAÇÃO_PARCIAL') && (
                                <div style={{ fontSize: '11px', fontWeight: 'bold', marginTop: '4px', color: item.status === 'FALTA' ? configDesign.cores.alerta : configDesign.cores.sucesso }}>{item.detalhe}</div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                // =============== MODO DETALHADA ===============
                dadosFechamento.itens.map((item, idx) => (
                  <div key={idx} style={{ padding: '15px', borderRadius: '12px', border: `1px solid ${configDesign.cores.borda}`, backgroundColor: item.status === 'OK' ? (isEscuro ? '#0f172a' : '#ffffff') : obterCorFundoStatus(item.status, isEscuro) }}>
                    
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
                        <div style={{ fontSize: '14px', fontWeight: 'bold', color: item.status === 'FALTA' ? configDesign.cores.alerta : (item.status === 'BONIFICAÇÃO' || item.status === 'BONIFICAÇÃO_PARCIAL') ? configDesign.cores.sucesso : item.status === 'BOLETO' ? configDesign.cores.aviso : configDesign.cores.textoSuave }}>
                          {item.unitario}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '11px', color: configDesign.cores.textoSuave, textTransform: 'uppercase' }}>Total</div>
                        <div style={{ fontSize: '16px', fontWeight: '900', color: item.status === 'FALTA' ? configDesign.cores.alerta : item.status === 'BONIFICAÇÃO' ? configDesign.cores.sucesso : item.status === 'BOLETO' ? configDesign.cores.aviso : configDesign.cores.textoForte }}>
                          {item.status === 'OK' || item.status === 'BONIFICAÇÃO_PARCIAL' ? formatarMoeda(item.total) : (
                             <span>{item.status === 'BONIFICAÇÃO_PARCIAL' ? 'BONIFIC. PARCIAL' : item.status}</span>
                          )}
                        </div>
                        {(item.status === 'FALTA' || item.status === 'BONIFICAÇÃO' || item.status === 'BONIFICAÇÃO_PARCIAL') && (
                           <div style={{ fontSize: '11px', marginTop: '4px', fontWeight: 'bold', color: item.status === 'FALTA' ? configDesign.cores.alerta : configDesign.cores.sucesso }}>{item.detalhe}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
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