import { supabase } from './supabase.js';
import { ui } from './ui.js';
import { Share } from '@capacitor/share';

// Estado global da aplicação
let estado = {
  usuario: null,
  timeAtual: null,
  meuMembro: null,
  isAdmin: false,
  partidaAtual: null,
  membros: [],
  presencas: [],
  abaAtiva: 'presenca'
};

// Formatação monetária e de data BR
const formatarMoeda = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
const formatarNumero = (val) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0);

// ====================================================================
// 1. INICIALIZAÇÃO & AUTENTICAÇÃO
// ====================================================================
async function inicializarApp() {
  configurarEventosNavegacao();
  configurarDatasIniciais();

  // Verifica sessão ativa no Supabase
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    estado.usuario = session.user;
    atualizarHeaderUsuario();
  }

  // Carrega ou recupera o time ativo
  const timeSalvoId = localStorage.getItem('amigos_time_ativo_id');
  if (timeSalvoId) {
    await carregarTimePorId(timeSalvoId);
  } else {
    // Busca o primeiro time que o usuário pertence ou abre o seletor
    await carregarTimesDoUsuario();
  }

  // Escuta mudanças de auth
  supabase.auth.onAuthStateChange(async (event, session) => {
    estado.usuario = session?.user || null;
    atualizarHeaderUsuario();
  });
}

function atualizarHeaderUsuario() {
  const elStatus = document.getElementById('header-user-status');
  if (estado.usuario) {
    elStatus.innerText = estado.usuario.email.split('@')[0];
  } else {
    elStatus.innerText = "Toque em 👤 para entrar";
  }
}

// ====================================================================
// 2. GESTÃO DE TIMES (MULTI-TENANCY)
// ====================================================================
async function carregarTimesDoUsuario() {
  if (!estado.usuario) {
    // Modo visitante ou convite: exibe modal de boas-vindas / entrar em time
    abrirModalSelecaoOuCriacaoTime();
    return;
  }

  const { data: participacoes, error } = await supabase
    .from('membros')
    .select('grupo_id, papel, grupos(*)')
    .eq('user_id', estado.usuario.id);

  if (error || !participacoes || participacoes.length === 0) {
    abrirModalSelecaoOuCriacaoTime();
    return;
  }

  // Carrega o primeiro grupo
  const primeiro = participacoes[0];
  await carregarTimePorId(primeiro.grupo_id);
}

async function carregarTimePorId(grupoId) {
  const { data: grupo, error } = await supabase
    .from('grupos')
    .select('*')
    .eq('id', grupoId)
    .single();

  if (error || !grupo) {
    localStorage.removeItem('amigos_time_ativo_id');
    return abrirModalSelecaoOuCriacaoTime();
  }

  estado.timeAtual = grupo;
  localStorage.setItem('amigos_time_ativo_id', grupo.id);
  document.getElementById('header-time-nome').innerText = grupo.nome;

  // Verifica se o usuário atual é admin do grupo
  if (estado.usuario) {
    const { data: membro } = await supabase
      .from('membros')
      .select('*')
      .eq('grupo_id', grupo.id)
      .eq('user_id', estado.usuario.id)
      .single();

    estado.meuMembro = membro || null;
    estado.isAdmin = grupo.dono_id === estado.usuario.id || membro?.papel === 'admin';
  } else {
    // Se não estiver logado por auth oficial, verifica se há um membro local salvo
    const membroLocalEmail = localStorage.getItem('amigos_meu_email');
    if (membroLocalEmail) {
      const { data: membro } = await supabase
        .from('membros')
        .select('*')
        .eq('grupo_id', grupo.id)
        .ilike('email', membroLocalEmail)
        .single();
      estado.meuMembro = membro || null;
      estado.isAdmin = membro?.papel === 'admin';
    }
  }

  atualizarBadgeUsuario();
  await carregarPartidaAtual();
  await carregarMembros();
}

function atualizarBadgeUsuario() {
  const badge = document.getElementById('badge-tipo-usuario');
  const painelAdmin = document.getElementById('painel-admin');
  const painelFinLancamento = document.getElementById('fin-painel-lancamento');

  if (estado.isAdmin) {
    badge.innerText = "Admin 🛠️";
    badge.className = "bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full lowercase font-bold";
    painelAdmin.classList.remove('hidden');
    painelFinLancamento.classList.remove('hidden');
  } else {
    badge.innerText = estado.meuMembro ? "Atleta" : "Visitante";
    badge.className = "bg-green-100 text-green-800 px-2 py-0.5 rounded-full lowercase font-semibold";
    painelAdmin.classList.add('hidden');
    painelFinLancamento.classList.add('hidden');
  }
}

async function abrirModalSelecaoOuCriacaoTime() {
  const acao = await ui.prompt({
    title: '⚽ Seu Time / Pelada',
    message: 'Escolha uma opção para continuar:',
    inputType: 'select',
    options: [
      { label: 'Entrar com Código de Convite', value: 'entrar' },
      { label: 'Criar uma Nova Pelada/Time', value: 'criar' },
      { label: 'Usar Time de Demonstração', value: 'demo' }
    ]
  });

  if (acao === 'entrar') {
    const codigo = await ui.prompt({
      title: 'Código do Time',
      message: 'Digite o código de convite enviado pelo organizador (Ex: BOLA-1234):',
      placeholder: 'BOLA-XXXX'
    });

    if (codigo) {
      const { data: grupo } = await supabase
        .from('grupos')
        .select('*')
        .ilike('codigo_convite', codigo.trim())
        .single();

      if (grupo) {
        ui.toast(`Você entrou no time ${grupo.nome}!`, 'success');
        await carregarTimePorId(grupo.id);
      } else {
        ui.toast('Código de time não encontrado.', 'error');
      }
    }
  } else if (acao === 'criar') {
    const nome = await ui.prompt({
      title: 'Nome do Time',
      message: 'Como se chama o seu time ou grupo de futebol?',
      placeholder: 'Ex: Amigos da Quinta FC'
    });

    if (nome) {
      const codigoGerado = 'BOLA-' + Math.floor(1000 + Math.random() * 9000);
      const { data: novoGrupo, error } = await supabase
        .from('grupos')
        .insert([{
          nome: nome.trim(),
          codigo_convite: codigoGerado,
          dono_id: estado.usuario?.id || null
        }])
        .select()
        .single();

      if (error) {
        ui.toast('Erro ao criar time: ' + error.message, 'error');
      } else {
        ui.toast(`Time "${nome}" criado com sucesso! Código: ${codigoGerado}`, 'success');
        await carregarTimePorId(novoGrupo.id);
      }
    }
  } else if (acao === 'demo') {
    // Procura qualquer grupo existente para visualização
    const { data: grupos } = await supabase.from('grupos').select('*').limit(1);
    if (grupos && grupos.length > 0) {
      await carregarTimePorId(grupos[0].id);
    } else {
      ui.toast('Nenhum time disponível. Crie o primeiro time!', 'info');
    }
  }
}

// ====================================================================
// 3. PARTIDA & PRESENÇA
// ====================================================================
async function carregarPartidaAtual() {
  if (!estado.timeAtual) return;

  const { data: partidas } = await supabase
    .from('partidas')
    .select('*')
    .eq('grupo_id', estado.timeAtual.id)
    .order('data_jogo', { ascending: false })
    .limit(1);

  if (partidas && partidas.length > 0) {
    estado.partidaAtual = partidas[0];
    exibirDadosPartida(partidas[0]);
    await carregarPresencas(partidas[0].id);
  } else {
    document.getElementById('data-jogo-display').innerText = "Nenhum jogo agendado";
    document.getElementById('local-jogo-display').innerText = "📍 Aguardando agendamento pelo organizador";
    document.getElementById('box-times').classList.add('hidden');
    document.getElementById('box-resultado').classList.add('hidden');
  }
}

function exibirDadosPartida(p) {
  const [ano, mes, dia] = p.data_jogo.split('-');
  document.getElementById('data-jogo-display').innerText = `${dia}/${mes}/${ano} às ${p.hora_jogo.substring(0,5)}h`;
  document.getElementById('local-jogo-display').innerText = `📍 Local: ${p.local_jogo || 'Arena Principal'}`;

  // Preenche dados do admin
  document.getElementById('admin-input-data').value = p.data_jogo;
  document.getElementById('admin-input-hora').value = p.hora_jogo.substring(0,5);
  document.getElementById('admin-input-local').value = p.local_jogo || '';

  // Bloqueio de jogo passado
  const dataHoraJogo = new Date(`${p.data_jogo}T${p.hora_jogo}`);
  const jogoEncerrado = new Date() > dataHoraJogo || p.status === 'encerrado';
  document.getElementById('status-bloqueio').classList.toggle('hidden', !jogoEncerrado);

  // Placar
  if (p.gols_a !== null && p.gols_b !== null) {
    document.getElementById('box-resultado').classList.remove('hidden');
    document.getElementById('placar-a').innerText = p.gols_a;
    document.getElementById('placar-b').innerText = p.gols_b;
    document.getElementById('admin-input-gols-a').value = p.gols_a;
    document.getElementById('admin-input-gols-b').value = p.gols_b;
  } else {
    document.getElementById('box-resultado').classList.add('hidden');
  }

  // Divisão de times
  const timeA = p.time_a || [];
  const timeB = p.time_b || [];
  if (timeA.length > 0 || timeB.length > 0) {
    document.getElementById('box-times').classList.remove('hidden');
    document.getElementById('lista-time-a').innerHTML = timeA.map(n => `<li>• ${n}</li>`).join('');
    document.getElementById('lista-time-b').innerHTML = timeB.map(n => `<li>• ${n}</li>`).join('');
  } else {
    document.getElementById('box-times').classList.add('hidden');
  }
}

async function carregarMembros() {
  if (!estado.timeAtual) return;

  const { data: membros, error } = await supabase
    .from('membros')
    .select('*')
    .eq('grupo_id', estado.timeAtual.id)
    .order('nome', { ascending: true });

  if (!error && membros) {
    estado.membros = membros;
    document.getElementById('badge-total-atletas').innerText = membros.length;
    renderizarListaAtletas();
  }
}

async function carregarPresencas(partidaId) {
  const { data: presencas } = await supabase
    .from('presencas')
    .select('*')
    .eq('partida_id', partidaId);

  estado.presencas = presencas || [];
  renderizarListaAtletas();
}

function renderizarListaAtletas() {
  const container = document.getElementById('lista-jogadores-container');
  container.innerHTML = '';

  let confirmados = 0;
  let ausentes = 0;
  let totalChurras = 0;

  if (estado.membros.length === 0) {
    container.innerHTML = `<div class="p-6 bg-white rounded-xl text-center text-xs text-gray-400">Nenhum atleta cadastrado ainda neste time.</div>`;
    return;
  }

  estado.membros.forEach(m => {
    const presenca = estado.presencas.find(p => p.membro_id === m.id);
    const confirmado = presenca ? presenca.confirmado : null;
    const churrasco = presenca ? presenca.churrasco : false;

    if (confirmado === true) confirmados++;
    if (confirmado === false) ausentes++;
    if (churrasco) totalChurras++;

    const ehMeuPerfil = estado.meuMembro && estado.meuMembro.id === m.id;
    const podeEditar = estado.isAdmin || ehMeuPerfil;

    const card = document.createElement('div');
    card.className = `flex items-center justify-between p-3.5 bg-white rounded-2xl border ${ehMeuPerfil ? 'border-green-500 ring-2 ring-green-100 shadow-sm' : 'border-gray-200/70'} ${confirmado === false ? 'opacity-60' : ''}`;

    card.innerHTML = `
      <div class="space-y-0.5">
        <div class="flex items-center gap-1.5">
          <p class="font-bold text-gray-900 text-xs">${m.nome}</p>
          ${m.posicao === 'Goleiro' ? '<span class="text-xs" title="Goleiro">🧤</span>' : ''}
          ${churrasco ? '<span class="text-xs" title="Churrasco">🥩</span>' : ''}
          ${ehMeuPerfil ? '<span class="text-[9px] bg-green-100 text-green-800 px-1.5 py-0.2 rounded-full font-bold">Você</span>' : ''}
        </div>
        <p class="text-[11px] text-gray-400">
          ${m.posicao} • 
          ${confirmado === true ? '<span class="text-emerald-600 font-bold">Confirmado</span>' : confirmado === false ? '<span class="text-rose-500 font-semibold">Ausente</span>' : '<span class="text-amber-500 font-medium">Pendente</span>'}
        </p>
      </div>

      <div class="flex items-center gap-1.5">
        <!-- Botão Churrasco -->
        <button data-action="churrasco" data-membro-id="${m.id}" class="p-2 rounded-xl text-xs font-bold border transition ${churrasco ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-gray-50 border-gray-200 text-gray-400'} ${!podeEditar ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'}">
          🥩
        </button>

        <!-- Botão Vou -->
        <button data-action="vou" data-membro-id="${m.id}" class="px-3 py-2 rounded-xl text-xs font-bold transition ${confirmado === true ? 'bg-emerald-600 text-white shadow-xs' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'} ${!podeEditar ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'}">
          Vou ✓
        </button>

        <!-- Botão Fora -->
        <button data-action="fora" data-membro-id="${m.id}" class="px-3 py-2 rounded-xl text-xs font-bold transition ${confirmado === false ? 'bg-rose-600 text-white shadow-xs' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'} ${!podeEditar ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'}">
          Fora ✗
        </button>

        ${estado.isAdmin ? `
          <button data-action="remover" data-membro-id="${m.id}" class="text-gray-300 hover:text-rose-600 p-1 text-xs">🗑️</button>
        ` : ''}
      </div>
    `;

    // Eventos de clique nos botões de ação
    card.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => lidarAcaoAtleta(btn.dataset.action, btn.dataset.membroId);
    });

    container.appendChild(card);
  });

  document.getElementById('total-confirmados').innerText = confirmados;
  document.getElementById('total-ausentes').innerText = ausentes;
  document.getElementById('total-churrasco').innerText = totalChurras;
}

async function lidarAcaoAtleta(acao, membroId) {
  if (!estado.partidaAtual) return ui.toast('Nenhum jogo ativo agendado.', 'warning');
  
  const ehMeuPerfil = estado.meuMembro && estado.meuMembro.id === membroId;
  if (!estado.isAdmin && !ehMeuPerfil) {
    return ui.toast('Você só pode alterar o seu próprio perfil!', 'warning');
  }

  let presenca = estado.presencas.find(p => p.membro_id === membroId);

  if (acao === 'vou') {
    await salvarPresenca(membroId, true, presenca?.churrasco || false);
  } else if (acao === 'fora') {
    await salvarPresenca(membroId, false, presenca?.churrasco || false);
  } else if (acao === 'churrasco') {
    const novoStatus = !(presenca?.churrasco || false);
    await salvarPresenca(membroId, presenca?.confirmado, novoStatus);
  } else if (acao === 'remover') {
    const confirmar = await ui.confirm({
      title: 'Remover Atleta',
      message: 'Tem certeza que deseja remover este atleta do time?',
      destructive: true
    });
    if (confirmar) {
      await supabase.from('membros').delete().eq('id', membroId);
      ui.toast('Atleta removido.', 'info');
      await carregarMembros();
    }
  }
}

async function salvarPresenca(membroId, confirmado, churrasco) {
  const { data, error } = await supabase
    .from('presencas')
    .upsert({
      partida_id: estado.partidaAtual.id,
      membro_id: membroId,
      confirmado: confirmado,
      churrasco: churrasco,
      updated_at: new Date().toISOString()
    }, { onConflict: 'partida_id,membro_id' })
    .select();

  if (error) {
    ui.toast('Erro ao atualizar presença: ' + error.message, 'error');
  } else {
    await carregarPresencas(estado.partidaAtual.id);
  }
}

// ====================================================================
// 4. SORTEIO DE TIMES & PLACAR
// ====================================================================
async function sortearEquipes() {
  if (!estado.isAdmin) return;
  const confirmados = estado.membros.filter(m => {
    const p = estado.presencas.find(x => x.membro_id === m.id);
    return p && p.confirmado === true;
  });

  if (confirmados.length < 2) {
    return ui.toast('É necessário pelo menos 2 atletas confirmados para sortear!', 'warning');
  }

  const goleiros = confirmados.filter(m => m.posicao === 'Goleiro').sort(() => Math.random() - 0.5);
  const linha = confirmados.filter(m => m.posicao !== 'Goleiro').sort(() => Math.random() - 0.5);

  const timeA = [];
  const timeB = [];

  // Distribuição de Goleiros
  if (goleiros[0]) timeA.push(goleiros[0].nome + ' 🧤');
  if (goleiros[1]) timeB.push(goleiros[1].nome + ' 🧤');
  for (let i = 2; i < goleiros.length; i++) {
    (i % 2 === 0 ? timeA : timeB).push(goleiros[i].nome + ' 🧤');
  }

  // Distribuição dos Jogadores de Linha
  linha.forEach((atleta, idx) => {
    (idx % 2 === 0 ? timeA : timeB).push(atleta.nome);
  });

  await supabase
    .from('partidas')
    .update({ time_a: timeA, time_b: timeB })
    .eq('id', estado.partidaAtual.id);

  ui.toast('Equipes sorteadas com equilíbrio!', 'success');
  await carregarPartidaAtual();
}

async function salvarPlacar() {
  if (!estado.isAdmin || !estado.partidaAtual) return;
  const golsA = document.getElementById('admin-input-gols-a').value;
  const golsB = document.getElementById('admin-input-gols-b').value;

  if (golsA === "" || golsB === "") {
    return ui.toast('Preencha os gols das duas equipes.', 'warning');
  }

  await supabase
    .from('partidas')
    .update({
      gols_a: parseInt(golsA),
      gols_b: parseInt(golsB),
      status: 'encerrado'
    })
    .eq('id', estado.partidaAtual.id);

  ui.toast('Placar final registrado!', 'success');
  await carregarPartidaAtual();
}

// ====================================================================
// 5. COMPARTILHAMENTO WHATSAPP (COM SUPORTE CAPACITOR SHARE NATIVO)
// ====================================================================
async function compartilharWhatsApp() {
  if (!estado.partidaAtual) return ui.toast('Nenhuma partida para compartilhar.', 'warning');

  const [ano, mes, dia] = estado.partidaAtual.data_jogo.split('-');
  const hora = estado.partidaAtual.hora_jogo.substring(0,5);
  const local = estado.partidaAtual.local_jogo || 'Arena Principal';
  const nomeTime = estado.timeAtual?.nome || 'Amigos da Bola';

  const confirmadosLinha = [];
  const goleiros = [];
  const desfalques = [];

  estado.membros.forEach(m => {
    const p = estado.presencas.find(x => x.membro_id === m.id);
    const churras = p?.churrasco ? ' 🥩' : '';
    if (p?.confirmado === true) {
      if (m.posicao === 'Goleiro') goleiros.push(m.nome + churras);
      else confirmadosLinha.push(m.nome + churras);
    } else if (p?.confirmado === false) {
      desfalques.push(m.nome + churras);
    }
  });

  let texto = `⚽ *${nomeTime}*\n`;
  texto += `🗓️ ${dia}/${mes}/${ano} às ⏰ ${hora}h\n`;
  texto += `📍 Local: ${local}\n\n`;

  texto += `🧤 *GOLEIROS*\n`;
  texto += `1. ${goleiros[0] || 'A definir'}\n`;
  texto += `2. ${goleiros[1] || 'A definir'}\n\n`;

  texto += `👕 *JOGADORES CONFIRMADOS (${confirmadosLinha.length})*\n`;
  confirmadosLinha.forEach((nome, i) => {
    texto += `${i + 1}. ${nome}\n`;
  });

  if (desfalques.length > 0) {
    texto += `\n❌ *DESFALQUES (${desfalques.length})*\n`;
    desfalques.forEach((nome, i) => {
      texto += `• ${nome}\n`;
    });
  }

  texto += `\n📲 _Confirmado pelo App Amigos da Bola_`;

  try {
    // Tenta usar o compartilhador nativo do Android se disponível
    await Share.share({
      title: `${nomeTime} - Lista do Jogo`,
      text: texto,
      dialogTitle: 'Enviar lista no WhatsApp'
    });
  } catch {
    // Fallback para URL do WhatsApp
    const urlWa = `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;
    window.open(urlWa, '_blank');
  }
}

// ====================================================================
// 6. CAIXA & FINANCEIRO
// ====================================================================
async function carregarFinanceiro() {
  if (!estado.timeAtual) return;
  const mesFiltro = document.getElementById('fin-filtro-mes').value;

  // Busca transações e mensalidades
  const { data: transacoes } = await supabase
    .from('transacoes')
    .select('*')
    .eq('grupo_id', estado.timeAtual.id);

  const { data: mensalidades } = await supabase
    .from('mensalidades')
    .select('*, membros(nome)')
    .eq('grupo_id', estado.timeAtual.id);

  let saldoAnterior = 0;
  let entradasMes = 0;
  let saidasMes = 0;

  (transacoes || []).forEach(t => {
    const mesT = t.data_lancamento.substring(0, 7);
    const val = Number(t.valor);
    if (mesT < mesFiltro) {
      saldoAnterior += t.tipo === 'ENTRADA' ? val : -val;
    } else if (mesT === mesFiltro) {
      if (t.tipo === 'ENTRADA') entradasMes += val;
      else saidasMes += val;
    }
  });

  let totalMensalidadesMes = 0;
  let pagosCount = 0;
  const mensalidadesDoMes = (mensalidades || []).filter(m => m.mes_ano === mesFiltro);

  (mensalidades || []).forEach(m => {
    if (m.pago) {
      const val = Number(m.valor_pago);
      if (m.mes_ano < mesFiltro) saldoAnterior += val;
      else if (m.mes_ano === mesFiltro) {
        totalMensalidadesMes += val;
        pagosCount++;
      }
    }
  });

  const totalEntradas = entradasMes + totalMensalidadesMes;
  const saldoLiquido = saldoAnterior + totalEntradas - saidasMes;

  document.getElementById('fin-saldo-anterior').innerText = formatarMoeda(saldoAnterior);
  document.getElementById('fin-total-entradas').innerText = formatarMoeda(totalEntradas);
  document.getElementById('fin-total-saidas').innerText = formatarMoeda(saidasMes);

  const elSaldoAtual = document.getElementById('fin-saldo-atual');
  elSaldoAtual.innerText = formatarMoeda(saldoLiquido);
  elSaldoAtual.className = `text-2xl font-black ${saldoLiquido >= 0 ? 'text-emerald-600' : 'text-rose-600'}`;
  document.getElementById('fin-resumo-pagos-badge').innerText = `${pagosCount} pagos`;

  renderizarMensalidades(mensalidadesDoMes);
  renderizarTransacoes((transacoes || []).filter(t => t.data_lancamento.substring(0, 7) === mesFiltro));
}

function renderizarMensalidades(lista) {
  const container = document.getElementById('fin-lista-mensalidades');
  container.innerHTML = '';

  if (lista.length === 0) {
    container.innerHTML = `<div class="p-4 bg-white rounded-xl text-center text-xs text-gray-400">Nenhuma mensalidade gerada para este mês.</div>`;
    return;
  }

  lista.forEach(m => {
    const item = document.createElement('div');
    item.className = 'p-3 bg-white rounded-xl border border-gray-200 shadow-xs flex items-center justify-between';
    item.innerHTML = `
      <div>
        <p class="font-bold text-gray-800 text-xs">${m.membros?.nome || 'Atleta'}</p>
        <p class="text-[11px] text-gray-400">Venc. ${m.vencimento.split('-').reverse().join('/')}</p>
      </div>
      <div>
        <button class="px-3 py-1.5 rounded-full text-xs font-bold transition ${m.pago ? 'bg-emerald-600 text-white' : 'bg-rose-500 text-white'}">
          ${m.pago ? 'Pago ✓' : 'Pendente'}
        </button>
      </div>
    `;

    if (estado.isAdmin) {
      item.querySelector('button').onclick = async () => {
        await supabase
          .from('mensalidades')
          .update({
            pago: !m.pago,
            valor_pago: !m.pago ? (estado.timeAtual.valor_mensalidade || 50) : 0,
            data_pagamento: !m.pago ? new Date().toISOString().substring(0,10) : null
          })
          .eq('id', m.id);
        ui.toast(m.pago ? 'Status alterado para pendente.' : 'Baixa de pagamento realizada!', 'info');
        await carregarFinanceiro();
      };
    }

    container.appendChild(item);
  });
}

function renderizarTransacoes(lista) {
  const container = document.getElementById('fin-lista-transacoes');
  container.innerHTML = '';

  if (lista.length === 0) {
    container.innerHTML = `<div class="p-3 bg-white rounded-xl text-center text-xs text-gray-400">Nenhum lançamento avulso neste mês.</div>`;
    return;
  }

  lista.forEach(t => {
    const item = document.createElement('div');
    const isEntrada = t.tipo === 'ENTRADA';
    item.className = 'flex justify-between items-center p-3 bg-white rounded-xl border border-gray-100 text-xs';
    item.innerHTML = `
      <div>
        <p class="font-bold text-gray-800">${t.descricao}</p>
        <p class="text-[10px] text-gray-400">${t.data_lancamento.split('-').reverse().join('/')}</p>
      </div>
      <p class="font-bold ${isEntrada ? 'text-emerald-600' : 'text-rose-600'}">
        ${isEntrada ? '+' : '-'} ${formatarMoeda(t.valor)}
      </p>
    `;
    container.appendChild(item);
  });
}

async function adicionarLancamentoCaixa() {
  if (!estado.isAdmin || !estado.timeAtual) return;
  const desc = document.getElementById('fin-input-desc').value;
  const valor = parseFloat(document.getElementById('fin-input-valor').value);
  const tipo = document.getElementById('fin-input-tipo').value;
  const data = document.getElementById('fin-input-data').value;

  if (!desc || isNaN(valor) || !data) {
    return ui.toast('Preencha descrição, valor e data.', 'warning');
  }

  await supabase.from('transacoes').insert([{
    grupo_id: estado.timeAtual.id,
    descricao: desc,
    valor: valor,
    tipo: tipo,
    data_lancamento: data
  }]);

  document.getElementById('fin-input-desc').value = '';
  document.getElementById('fin-input-valor').value = '';
  ui.toast('Lançamento registrado com sucesso!', 'success');
  await carregarFinanceiro();
}

// ====================================================================
// 7. EVENTOS, ABAS & POLÍTICAS GOOGLE PLAY
// ====================================================================
function configurarEventosNavegacao() {
  const tabs = ['presenca', 'historico', 'financeiro'];
  tabs.forEach(tab => {
    document.getElementById(`tab-${tab}`).onclick = () => alternarAba(tab);
  });

  document.getElementById('btn-trocar-time').onclick = abrirModalSelecaoOuCriacaoTime;
  document.getElementById('btn-compartilhar-whatsapp').onclick = compartilharWhatsApp;

  // Botões do Admin
  document.getElementById('admin-btn-sortear').onclick = sortearEquipes;
  document.getElementById('admin-btn-salvar-placar').onclick = salvarPlacar;
  document.getElementById('fin-btn-lancar').onclick = adicionarLancamentoCaixa;
  document.getElementById('fin-filtro-mes').onchange = carregarFinanceiro;

  // Botão Adicionar Atleta
  document.getElementById('admin-btn-adicionar-atleta').onclick = async () => {
    const nome = document.getElementById('admin-novo-atleta-nome').value;
    const email = document.getElementById('admin-novo-atleta-email').value;
    const pos = document.getElementById('admin-novo-atleta-pos').value;

    if (!nome) return ui.toast('Digite o nome do jogador.', 'warning');

    await supabase.from('membros').insert([{
      grupo_id: estado.timeAtual.id,
      nome: nome.trim(),
      email: email ? email.trim() : null,
      posicao: pos
    }]);

    document.getElementById('admin-novo-atleta-nome').value = '';
    document.getElementById('admin-novo-atleta-email').value = '';
    ui.toast('Atleta adicionado com sucesso!', 'success');
    await carregarMembros();
  };

  // Botão Perfil & Autenticação
  document.getElementById('btn-perfil').onclick = abrirModalPerfil;

  // Políticas e Exclusão de Conta (Obrigatório Google Play)
  document.getElementById('link-privacidade').onclick = (e) => {
    e.preventDefault();
    ui.confirm({
      title: 'Política de Privacidade',
      message: 'O Amigos da Bola armazena dados de nome, presenças e registros financeiros unicamente para fins de organização esportiva da sua pelada. Não compartilhamos dados com terceiros nem exibimos anúncios rastreadores.',
      confirmText: 'Entendido',
      cancelText: 'Fechar'
    });
  };

  document.getElementById('link-excluir-conta').onclick = async (e) => {
    e.preventDefault();
    const confirmou = await ui.confirm({
      title: 'Excluir meus dados',
      message: 'Conforme as diretrizes da Google Play e LGPD, ao confirmar, todos os seus dados pessoais e vínculos com os times serão desvinculados permanentemente. Deseja prosseguir?',
      confirmText: 'Excluir Definitivamente',
      destructive: true
    });
    if (confirmou) {
      if (estado.usuario) {
        await supabase.from('membros').delete().eq('user_id', estado.usuario.id);
        await supabase.auth.signOut();
      }
      localStorage.clear();
      ui.toast('Dados excluídos com sucesso.', 'info');
      setTimeout(() => window.location.reload(), 1500);
    }
  };
}

function alternarAba(aba) {
  estado.abaAtiva = aba;
  ['presenca', 'historico', 'financeiro'].forEach(t => {
    const elView = document.getElementById(`view-${t}`);
    const elTab = document.getElementById(`tab-${t}`);
    const isAtiva = t === aba;

    elView.classList.toggle('hidden', !isAtiva);
    elTab.className = isAtiva 
      ? "flex-1 py-3 text-xs font-bold border-b-2 border-green-600 text-green-700 transition" 
      : "flex-1 py-3 text-xs font-bold border-b-2 border-transparent text-gray-400 hover:text-gray-600 transition";
  });

  if (aba === 'financeiro') carregarFinanceiro();
}

async function abrirModalPerfil() {
  if (estado.usuario) {
    const acao = await ui.prompt({
      title: 'Meu Perfil',
      message: `Conectado como: ${estado.usuario.email}`,
      inputType: 'select',
      options: [
        { label: 'Continuar no app', value: 'fechar' },
        { label: 'Sair da Conta (Logout)', value: 'sair' }
      ]
    });
    if (acao === 'sair') {
      await supabase.auth.signOut();
      estado.usuario = null;
      atualizarHeaderUsuario();
      ui.toast('Sessão encerrada.', 'info');
    }
  } else {
    const email = await ui.prompt({
      title: 'Identificar seu Perfil',
      message: 'Digite seu e-mail para vincular seu perfil e suas confirmações de presença:',
      placeholder: 'seuemail@exemplo.com'
    });
    if (email) {
      localStorage.setItem('amigos_meu_email', email.trim().toLowerCase());
      ui.toast('Perfil vinculado!', 'success');
      if (estado.timeAtual) await carregarTimePorId(estado.timeAtual.id);
    }
  }
}

function configurarDatasIniciais() {
  const hoje = new Date();
  const yyyy = hoje.getFullYear();
  const mm = String(hoje.getMonth() + 1).padStart(2, '0');
  const dd = String(hoje.getDate()).padStart(2, '0');

  document.getElementById('fin-filtro-mes').value = `${yyyy}-${mm}`;
  document.getElementById('fin-input-data').value = `${yyyy}-${mm}-${dd}`;
  document.getElementById('admin-input-data').value = `${yyyy}-${mm}-${dd}`;
}

// Inicia aplicação
window.addEventListener('DOMContentLoaded', inicializarApp);
