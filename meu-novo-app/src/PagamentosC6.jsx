import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

// 💡 FUNÇÕES AUXILIARES
const obterDataLocal = () => {
  const data = new Date();
  const tzOffset = data.getTimezoneOffset() * 60000;
  return new Date(data.getTime() - tzOffset).toISOString().split('T')[0];
};

const calcularDataPosterior = (dataString) => {
  if (!dataString) return '';
  const [ano, mes, dia] = dataString.split('-');
  const dataObj = new Date(ano, mes - 1, dia);
  dataObj.setDate(dataObj.getDate() + 1);
  return dataObj.toLocaleDateString('pt-BR');
};

// 💡 MÁSCARA QUE LIDA CORRETAMENTE COM NÚMEROS NEGATIVOS (CRÉDITO)
const tratarPrecoNum = (p) => {
  if (!p || typeof p !== 'string') return 0;
  const isNegative = String(p).includes('-'); // Verifica se é um crédito
  let strClean = String(p).replace(/[R$\-\s]/g, '').trim().replace(/\./g, '').replace(',', '.');
  let num = parseFloat(strClean) || 0;
  return isNegative ? -Math.abs(num) : num;
};

const removerAcentos = (str) => String(str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

const formatarMoeda = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatarChavePix = (chave) => {
  if (!chave) return '';
  const c = String(chave).trim();
  if (c.includes('@')) return c;
  if (c.length === 36 && c.includes('-')) return c;
  return c.replace(/[.\-\/\(\)\s]/g, '');
};

const isChavePixSuspeita = (chave) => {
  if (!chave || chave === 'Não cadastrada') return false;
  const c = String(chave).replace(/[.\-\/\(\)\s]/g, '');
  if (c.length >= 5 && /^(.)\1+$/.test(c)) return true;
  return false;
};

export default function PagamentosC6({ isEscuro }) {
  const [dataFiltro, setDataFiltro] = useState(() => localStorage.getItem('virtus_fechamento_data') || obterDataLocal());
  const [fornecedores, setFornecedores] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [notificacoes, setNotificacoes] = useState([]);
  
  // Controle de abas
  const [abaAtiva, setAbaAtiva] = useState('pendentes');

  // Estado para gerenciar quem foi retirado do lote
  const [fornecedoresIgnorados, setFornecedoresIgnorados] = useState([]);

  // Cores do tema
  const themeBg = isEscuro ? '#0f172a' : '#f5f5f4';
  const themeCard = isEscuro ? '#1e293b' : '#ffffff';
  const themeText = isEscuro ? '#f8fafc' : '#111111';
  const themeBorder = isEscuro ? '#334155' : '#e2e8f0';
  const themeMenuTop = isEscuro ? '#020617' : '#111111';

  const dataFechamentoBr = calcularDataPosterior(dataFiltro);

  const mostrarNotificacao = (mensagem, tipo = 'info') => {
    const id = Date.now() + Math.random();
    setNotificacoes(prev => [...prev, { id, mensagem, tipo }]);
    setTimeout(() => setNotificacoes(prev => prev.filter(n => n.id !== id)), 3000);
  };

  const carregarDados = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const { data: pedData } = await supabase.from('pedidos').select('*').eq('data_pedido', dataFiltro);
      const { data: fornData } = await supabase.from('fornecedores').select('*');
      
      const mapaForn = {};

      (pedData || []).forEach(p => {
        if (p.status_compra === 'atendido' || p.status_compra === 'boleto') {
          if (!p.apenas_cobranca) {
            let fNomeOriginal = p.fornecedor_compra ? String(p.fornecedor_compra).toUpperCase() : 'SEM FORNECEDOR';
            if (fNomeOriginal.startsWith('ALERTA|')) fNomeOriginal = fNomeOriginal.replace('ALERTA|', '');
            
            const isBoleto = p.status_compra === 'boleto';
            const fNome = isBoleto ? `${fNomeOriginal} (BOLETO)` : fNomeOriginal;
            
            let baseVal = p.custo_unit; 
            let qtdBonifFornecedor = Number(p.qtd_bonificada) || 0;
            
            if (String(p.custo_unit).includes('BONIFICAÇÃO |')) {
               baseVal = baseVal.split('|')[1] ? baseVal.split('|')[1].trim() : 'R$ 0,00';
            }
            
            // 💡 LÊ O VALOR CORRETAMENTE, INCLUINDO NEGATIVOS (CRÉDITO)
            const valNum = tratarPrecoNum(baseVal);
  
            if (!mapaForn[fNome]) {
              let match = fornData?.find(f => removerAcentos(f.nome_fantasia).trim() === removerAcentos(fNomeOriginal).trim());
              if (!match) match = fornData?.find(f => removerAcentos(f.nome_fantasia).includes(removerAcentos(fNomeOriginal)) || removerAcentos(fNomeOriginal).includes(removerAcentos(f.nome_fantasia)));

              const nomeParaBanco = match && match.nome_completo && match.nome_completo.trim() !== '' 
                ? match.nome_completo 
                : (match ? match.nome_fantasia : fNomeOriginal);

              mapaForn[fNome] = { 
                 nome: fNome, 
                 nomeCadastrado: match ? match.nome_fantasia : fNomeOriginal,
                 nomeRecebedor: nomeParaBanco,
                 chavePix: match ? match.chave_pix : '', 
                 totalPix: 0, 
                 statusPagamento: p.status_pagamento || 'pendente',
                 isBoletoGeral: isBoleto,
                 itensRaw: {} 
              };
            } else {
              if (p.status_pagamento === 'pago') mapaForn[fNome].statusPagamento = 'pago';
            }
  
            // Usa o valNum real como chave (separa positivos de negativos no mesmo produto)
            const keyItem = `${p.nome_produto}_${isBoleto}_${valNum}`;
            if (!mapaForn[fNome].itensRaw[keyItem]) {
                mapaForn[fNome].itensRaw[keyItem] = { 
                    qtd: 0, 
                    qtdBonificada: 0, 
                    valNumReal: valNum, 
                    isBoleto: isBoleto 
                };
            }
  
            const raw = mapaForn[fNome].itensRaw[keyItem];
            raw.qtd += Number(p.qtd_atendida || 0);
            raw.qtdBonificada += qtdBonifFornecedor;
          }
        }
      });

      Object.values(mapaForn).forEach(forn => {
          Object.values(forn.itensRaw).forEach(raw => {
              const qtdCobrada = Math.max(0, raw.qtd - raw.qtdBonificada);
              
              // O total cobrado vai ser negativo se a unidade for crédito
              const totalCobrado = qtdCobrada * raw.valNumReal;
              
              if (!raw.isBoleto) {
                  forn.totalPix += totalCobrado;
              }
          });
          delete forn.itensRaw; 
      });

      // 💡 GARANTE QUE SÓ FORNECEDORES DE PIX COM SALDO A RECEBER APAREÇAM AQUI
      const apenasPix = Object.values(mapaForn)
        .filter(f => !f.isBoletoGeral && !f.nome.includes('(BOLETO)') && f.totalPix > 0)
        .sort((a, b) => a.nome.localeCompare(b.nome));

      setFornecedores(apenasPix);
      
      // Limpa os ignorados se trocar de data
      if (!silencioso) setFornecedoresIgnorados([]);

    } catch (err) { 
      console.error(err); 
    } finally { 
      if (!silencioso) setCarregando(false); 
    }
  }, [dataFiltro]);

  useEffect(() => {
    localStorage.setItem('virtus_fechamento_data', dataFiltro);
    carregarDados();
  }, [carregarDados, dataFiltro]);

  // Alterna o status no banco de dados individualmente
  const alternarStatusPagamento = async (nomeForn, statusAtual) => {
    const novoStatus = statusAtual === 'pago' ? 'pendente' : 'pago';
    const nomeLimpo = nomeForn.replace(' (BOLETO)', ''); 
    
    setFornecedores(prev => prev.map(f => f.nome === nomeForn ? { ...f, statusPagamento: novoStatus } : f));
    
    try {
      await supabase.from('pedidos').update({ status_pagamento: novoStatus }).eq('data_pedido', dataFiltro).ilike('fornecedor_compra', `%${nomeLimpo}%`);
    } catch (err) { 
      console.error("Erro", err); 
      mostrarNotificacao('Erro ao alterar status', 'alerta');
    }
  };

  // Retirar/Colocar no Lote
  const alternarLote = (nomeForn) => {
    setFornecedoresIgnorados(prev => 
      prev.includes(nomeForn) ? prev.filter(n => n !== nomeForn) : [...prev, nomeForn]
    );
  };

  const fornecedoresPendentes = fornecedores.filter(f => f.statusPagamento !== 'pago');
  const fornecedoresFeitos = fornecedores.filter(f => f.statusPagamento === 'pago');
  
  // 💡 FILTRAGEM DO LOTE (Somente quem está pendente E NÃO FOI IGNORADO)
  const fornecedoresNoLote = fornecedoresPendentes.filter(f => !fornecedoresIgnorados.includes(f.nome));

  // Filtra os que tem erro DENTRO DO LOTE para mostrar o alerta no topo
  const errosNoLote = fornecedoresNoLote.filter(f => 
    !f.chavePix || f.chavePix === 'Não cadastrada' || isChavePixSuspeita(f.chavePix)
  );

  // MARCAR LISTA (LOTE) COMO PAGA
  const marcarListaComoPaga = async () => {
    if (fornecedoresNoLote.length === 0) return alert('Não há fornecedores válidos no lote para marcar.');
    
    if (!window.confirm(`Deseja marcar os ${fornecedoresNoLote.length} fornecedores DENTRO DO LOTE como PAGOS?\n(Fornecedores retirados do lote continuarão como pendentes).`)) return;

    setCarregando(true);
    try {
      const promessas = fornecedoresNoLote.map(f => {
         const nomeLimpo = f.nome.replace(' (BOLETO)', '');
         return supabase.from('pedidos').update({ status_pagamento: 'pago' }).eq('data_pedido', dataFiltro).ilike('fornecedor_compra', `%${nomeLimpo}%`);
      });
      
      await Promise.all(promessas);
      
      // Atualiza o state local marcando só quem estava no lote
      setFornecedores(prev => prev.map(f => 
        fornecedoresNoLote.some(loteForn => loteForn.nome === f.nome) ? { ...f, statusPagamento: 'pago' } : f
      ));

      mostrarNotificacao(`✅ Lote de ${fornecedoresNoLote.length} fornecedor(es) marcado como pago!`, 'sucesso');
    } catch (error) {
      alert("Erro ao marcar a lista: " + error.message);
    } finally {
      setCarregando(false);
    }
  };

  // COPIAR DADOS COM TRAVA DE SEGURANÇA
  const copiarDadosPlanilha = () => {
    if (errosNoLote.length > 0) {
        return alert(`⚠️ AVISO: Há fornecedores no lote com chave PIX ausente ou inválida.\n\nRetire-os do lote usando o botão "❌ RETIRAR DO LOTE" antes de copiar a planilha para o banco.\n\nCom erro: ${errosNoLote.map(f => f.nome).join(', ')}`);
    }

    if (fornecedoresNoLote.length === 0) {
        return alert("Não há nenhum fornecedor válido no lote para copiar.");
    }

    const dadosTSV = fornecedoresNoLote.map(f => {
        const valorAjustado = Number(f.totalPix).toFixed(2).replace('.', ','); 
        const chavePixLimpa = formatarChavePix(f.chavePix);
        
        return `${f.nomeRecebedor}\t${chavePixLimpa}\t${valorAjustado}\t${dataFechamentoBr}\tFechamento Frazão ${dataFechamentoBr}`;
    }).join('\n');

    navigator.clipboard.writeText(dadosTSV).then(() => {
        mostrarNotificacao('📋 Dados copiados! Vá na planilha original do C6, clique na célula A3 e cole (Ctrl + V).', 'sucesso');
    }).catch(err => {
        alert('Erro ao copiar: ' + err);
    });
  };

  const listaExibida = abaAtiva === 'pendentes' ? fornecedoresPendentes : fornecedoresFeitos;

  const irParaFornecedor = (nomeForn) => {
    const elemento = document.getElementById(`forn-${nomeForn.replace(/\W/g, '')}`);
    if (elemento) {
      elemento.scrollIntoView({ behavior: 'smooth', block: 'center' });
      elemento.style.transition = 'box-shadow 0.3s';
      elemento.style.boxShadow = '0 0 20px #ef4444';
      setTimeout(() => elemento.style.boxShadow = 'none', 1500);
    }
  };

  return (
    <div style={{ backgroundColor: themeBg, minHeight: '100vh', padding: '10px', paddingBottom: '100px', fontFamily: 'sans-serif', transition: '0.3s' }}>
      
      <div style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 99999, display: 'flex', flexDirection: 'column', gap: '10px', width: '90%', maxWidth: '400px' }}>
        {notificacoes.map(notif => (
          <div key={notif.id} style={{ background: notif.tipo === 'alerta' ? '#ef4444' : '#22c55e', color: '#fff', padding: '15px 20px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', fontWeight: 'bold', fontSize: '13px', textAlign: 'center' }}>
            {notif.mensagem}
          </div>
        ))}
      </div>

      <div style={{ maxWidth: '1000px', margin: '0 auto', backgroundColor: themeMenuTop, padding: '25px', borderRadius: '16px', color: '#fff', marginBottom: '20px', border: isEscuro ? '1px solid #334155' : 'none' }}>
        <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '900' }}>💳 ARQUIVO C6 BANK (AUTOMATIZAÇÃO)</h2>
        <p style={{ margin: '5px 0 15px 0', color: '#94a3b8', fontSize: '13px' }}>Exclusivo para pagamentos de fornecedores via PIX.</p>
        
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input 
              type="date" 
              value={dataFiltro} 
              onChange={(e) => setDataFiltro(e.target.value)}
              style={{ background: isEscuro ? '#1e293b' : '#fff', color: themeText, border: 'none', borderRadius: '8px', padding: '10px 15px', fontSize: '14px', outline: 'none', cursor: 'pointer', fontWeight: 'bold' }}
            />
            
            <button onClick={copiarDadosPlanilha} style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', boxShadow: '0 4px 15px rgba(245,158,11,0.4)', flex: '1 1 auto', fontSize: '14px' }}>
                📋 COPIAR DADOS DO LOTE (EXCEL C6)
            </button>
        </div>
      </div>

      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        
        {/* 💡 ALERTA GLOBAL NO TOPO SE HOUVER ERROS NO LOTE */}
        {abaAtiva === 'pendentes' && errosNoLote.length > 0 && (
          <div style={{ backgroundColor: '#fef2f2', border: '2px solid #ef4444', borderRadius: '16px', padding: '20px', marginBottom: '20px', color: '#991b1b' }}>
             <h3 style={{ margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', fontWeight: '900' }}>🚨 ATENÇÃO: Chaves PIX Incorretas no Lote</h3>
             <p style={{ margin: '0 0 15px 0', fontSize: '13px', fontWeight: 'bold' }}>
               Os fornecedores abaixo estão sem PIX ou com uma chave inválida. <br/>Clique no botão para ir até eles e selecione <b>"❌ RETIRAR DO LOTE"</b> para poder copiar a planilha dos outros, mantendo-os pendentes.
             </p>
             <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
               {errosNoLote.map(f => (
                 <button 
                   key={f.nome} 
                   onClick={() => irParaFornecedor(f.nome)}
                   style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', fontSize: '11px', boxShadow: '0 4px 10px rgba(239,68,68,0.3)' }}
                 >
                   📍 IR PARA: {f.nome}
                 </button>
               ))}
             </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '5px', marginBottom: '20px' }}>
          <button 
            onClick={() => setAbaAtiva('pendentes')} 
            style={{ flex: 1, padding: '15px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'pendentes' ? '#f97316' : themeCard, color: abaAtiva === 'pendentes' ? '#fff' : '#64748b' }}
          >
            ⏳ PENDENTES ({fornecedoresPendentes.length})
          </button>
          <button 
            onClick={() => setAbaAtiva('feitos')} 
            style={{ flex: 1, padding: '15px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'feitos' ? '#10b981' : themeCard, color: abaAtiva === 'feitos' ? '#fff' : '#64748b' }}
          >
            ✅ FEITOS ({fornecedoresFeitos.length})
          </button>
        </div>

        {/* 💡 BOTÃO GLOBAL DE PAGAMENTO DO LOTE */}
        {abaAtiva === 'pendentes' && fornecedoresNoLote.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '15px' }}>
            <button onClick={marcarListaComoPaga} style={{ background: '#10b981', color: '#fff', padding: '10px 20px', borderRadius: '10px', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px', boxShadow: '0 4px 15px rgba(16,185,129,0.3)' }}>
               ✅ MARCAR LISTA COMO PAGA ({fornecedoresNoLote.length})
            </button>
          </div>
        )}

        {carregando ? (
            <div style={{ textAlign: 'center', padding: '40px', color: themeText, fontWeight: 'bold' }}>Carregando dados...</div>
        ) : listaExibida.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', backgroundColor: themeCard, borderRadius: '16px', color: '#64748b', fontWeight: 'bold' }}>
                Nenhum fornecedor nesta aba para esta data.
            </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {listaExibida.map((f, idx) => {
                const isPago = f.statusPagamento === 'pago';
                const isIgnorado = fornecedoresIgnorados.includes(f.nome);
                
                const faltaPix = !f.chavePix || f.chavePix === 'Não cadastrada';
                const suspeitoPix = !faltaPix && isChavePixSuspeita(f.chavePix);
                
                let corBorda = themeBorder;
                let corFundo = themeCard;
                let avisoExtra = null;

                if (isIgnorado && !isPago) {
                    corBorda = '#cbd5e1'; 
                    corFundo = isEscuro ? '#1e293b' : '#f8fafc';
                } else if ((faltaPix || suspeitoPix) && !isPago) {
                    corBorda = '#ef4444'; 
                    corFundo = isEscuro ? '#450a0a' : '#fef2f2';
                    avisoExtra = faltaPix ? "⚠️ PENDÊNCIA: Falta Chave PIX" : "⚠️ CHAVE PIX INVÁLIDA (Parece ser fictícia)";
                } else if (isPago) {
                    corBorda = '#22c55e'; 
                    corFundo = isEscuro ? '#064e3b' : '#f0fdf4';
                }

                const cardId = `forn-${f.nome.replace(/\W/g, '')}`;

                return (
                    <div id={cardId} key={idx} style={{ backgroundColor: corFundo, borderRadius: '16px', border: `2px solid ${corBorda}`, padding: '20px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '15px', transition: 'all 0.3s', opacity: (isPago || isIgnorado) ? 0.6 : 1 }}>
                        <div style={{ flex: '1 1 auto' }}>
                            <h3 style={{ margin: 0, fontSize: '16px', color: themeText, textTransform: 'uppercase', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {f.nome}
                                {isIgnorado && !isPago && <span style={{fontSize: '10px', background: '#e2e8f0', color: '#475569', padding: '3px 8px', borderRadius: '6px'}}>🔒 FORA DO LOTE</span>}
                            </h3>
                            
                            <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
                                <span style={{ display: 'block' }}>Nome Banco: <strong style={{ color: themeText }}>{f.nomeRecebedor}</strong></span>
                                <span style={{ display: 'block', marginTop: '4px' }}>Chave PIX: <strong style={{ color: themeText }}>{f.chavePix || 'Não cadastrada'}</strong></span>
                            </div>

                            {avisoExtra && !isIgnorado && (
                                <div style={{ marginTop: '8px', fontSize: '11px', fontWeight: '900', color: '#ef4444' }}>
                                    {avisoExtra}
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                            <div style={{ textAlign: 'right' }}>
                                <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', display: 'block' }}>TOTAL (R$)</span>
                                <strong style={{ fontSize: '20px', color: themeText, fontWeight: '900', textDecoration: isIgnorado ? 'line-through' : 'none' }}>{formatarMoeda(f.totalPix)}</strong>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {!isPago && (
                                <button 
                                    onClick={() => alternarLote(f.nome)} 
                                    style={{ background: isIgnorado ? '#e2e8f0' : '#fee2e2', color: isIgnorado ? '#475569' : '#ef4444', border: 'none', padding: '8px 15px', borderRadius: '8px', fontWeight: 'bold', fontSize: '10px', cursor: 'pointer', transition: '0.2s' }}
                                >
                                    {isIgnorado ? '➕ VOLTAR PARA O LOTE' : '❌ RETIRAR DO LOTE'}
                                </button>
                              )}

                              <button 
                                  onClick={() => alternarStatusPagamento(f.nome, f.statusPagamento)} 
                                  style={{ background: isPago ? 'transparent' : '#3b82f6', color: isPago ? '#3b82f6' : '#fff', border: `2px solid #3b82f6`, padding: '10px 15px', borderRadius: '8px', fontWeight: '900', fontSize: '11px', cursor: 'pointer', transition: '0.2s' }}
                              >
                                  {isPago ? 'MARCAR PENDENTE' : '✅ PAGAMENTO INDIVIDUAL'}
                              </button>
                            </div>
                        </div>
                    </div>
                )
            })}
          </div>
        )}
      </div>
    </div>
  );
}