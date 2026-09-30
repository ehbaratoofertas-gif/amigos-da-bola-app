-- ====================================================================
-- ESQUEMA MULTI-TENANT (MÚLTIPLOS TIMES/PELADAS) - AMIGOS DA BOLA
-- Otimizado para Plano Gratuito do Supabase (Zero Gargalo / Baixo Consumo de CPU)
-- ====================================================================

-- 1. TABELA DE GRUPOS (Ligas / Peladas)
CREATE TABLE IF NOT EXISTS public.grupos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    codigo_convite TEXT UNIQUE NOT NULL, -- Código fácil para WhatsApp (Ex: "BOLA-7890")
    dono_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    local_padrao TEXT DEFAULT 'Arena Principal',
    hora_padrao TIME DEFAULT '20:30',
    valor_mensalidade NUMERIC(10,2) DEFAULT 50.00,
    dia_vencimento INTEGER DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. TABELA DE MEMBROS (Atletas e Administradores de cada grupo)
CREATE TABLE IF NOT EXISTS public.membros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grupo_id UUID REFERENCES public.grupos(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    email TEXT,
    posicao TEXT DEFAULT 'Linha' CHECK (posicao IN ('Linha', 'Goleiro')),
    papel TEXT DEFAULT 'atleta' CHECK (papel IN ('admin', 'atleta')),
    mensalista BOOLEAN DEFAULT true,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(grupo_id, user_id)
);

-- 3. TABELA DE PARTIDAS (Jogos)
CREATE TABLE IF NOT EXISTS public.partidas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grupo_id UUID REFERENCES public.grupos(id) ON DELETE CASCADE NOT NULL,
    data_jogo DATE NOT NULL,
    hora_jogo TIME NOT NULL,
    local_jogo TEXT DEFAULT 'Arena Principal',
    status TEXT DEFAULT 'agendado' CHECK (status IN ('agendado', 'em_andamento', 'encerrado')),
    gols_a INTEGER,
    gols_b INTEGER,
    time_a JSONB DEFAULT '[]'::jsonb,
    time_b JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. TABELA DE PRESENÇAS (Confirmações por partida)
CREATE TABLE IF NOT EXISTS public.presencas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partida_id UUID REFERENCES public.partidas(id) ON DELETE CASCADE NOT NULL,
    membro_id UUID REFERENCES public.membros(id) ON DELETE CASCADE NOT NULL,
    confirmado BOOLEAN, -- true = Vou, false = Fora, null = Pendente
    churrasco BOOLEAN DEFAULT false,
    time_manual TEXT, -- 'Time A', 'Time B' ou null
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(partida_id, membro_id)
);

-- 5. TABELA DE MENSALIDADES
CREATE TABLE IF NOT EXISTS public.mensalidades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grupo_id UUID REFERENCES public.grupos(id) ON DELETE CASCADE NOT NULL,
    membro_id UUID REFERENCES public.membros(id) ON DELETE CASCADE NOT NULL,
    mes_ano VARCHAR(7) NOT NULL, -- formato YYYY-MM
    vencimento DATE NOT NULL,
    valor_pago NUMERIC(10,2) DEFAULT 0,
    pago BOOLEAN DEFAULT false,
    data_pagamento DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(grupo_id, membro_id, mes_ano)
);

-- 6. TABELA DE LANÇAMENTOS DO CAIXA
CREATE TABLE IF NOT EXISTS public.transacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grupo_id UUID REFERENCES public.grupos(id) ON DELETE CASCADE NOT NULL,
    descricao TEXT NOT NULL,
    valor NUMERIC(10,2) NOT NULL,
    tipo TEXT CHECK (tipo IN ('ENTRADA', 'SAIDA')) NOT NULL,
    data_lancamento DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ====================================================================
-- ÍNDICES DE ALTA PERFORMANCE (Evita Full Table Scan e estouro de CPU)
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_membros_grupo ON public.membros(grupo_id);
CREATE INDEX IF NOT EXISTS idx_membros_user ON public.membros(user_id);
CREATE INDEX IF NOT EXISTS idx_partidas_grupo_data ON public.partidas(grupo_id, data_jogo DESC);
CREATE INDEX IF NOT EXISTS idx_presencas_partida ON public.presencas(partida_id);
CREATE INDEX IF NOT EXISTS idx_mensalidades_grupo_mes ON public.mensalidades(grupo_id, mes_ano);
CREATE INDEX IF NOT EXISTS idx_transacoes_grupo_data ON public.transacoes(grupo_id, data_lancamento DESC);

-- ====================================================================
-- FUNÇÕES AUXILIARES DE SEGURANÇA (SECURITY DEFINER)
-- ====================================================================
CREATE OR REPLACE FUNCTION public.eh_membro_do_grupo(p_grupo_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.membros
        WHERE grupo_id = p_grupo_id AND user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.eh_admin_do_grupo(p_grupo_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.grupos g
        LEFT JOIN public.membros m ON m.grupo_id = g.id AND m.user_id = auth.uid()
        WHERE g.id = p_grupo_id AND (g.dono_id = auth.uid() OR m.papel = 'admin')
    );
$$;

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) - ISOLAMENTO 100% ENTRE OS TIMES
-- ====================================================================
ALTER TABLE public.grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presencas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensalidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transacoes ENABLE ROW LEVEL SECURITY;

-- Políticas para GRUPOS
CREATE POLICY "Visualizar grupos pertencentes ou públicos por convite"
    ON public.grupos FOR SELECT
    USING (eh_membro_do_grupo(id) OR dono_id = auth.uid());

CREATE POLICY "Criar novo grupo"
    ON public.grupos FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Atualizar grupo somente se for admin"
    ON public.grupos FOR UPDATE
    USING (eh_admin_do_grupo(id));

-- Políticas para MEMBROS
CREATE POLICY "Ver membros do mesmo grupo"
    ON public.membros FOR SELECT
    USING (eh_membro_do_grupo(grupo_id));

CREATE POLICY "Adicionar membro ao grupo"
    ON public.membros FOR INSERT
    WITH CHECK (eh_admin_do_grupo(grupo_id) OR user_id = auth.uid());

CREATE POLICY "Atualizar membro (próprio perfil ou admin)"
    ON public.membros FOR UPDATE
    USING (user_id = auth.uid() OR eh_admin_do_grupo(grupo_id));

CREATE POLICY "Excluir membro somente admin"
    ON public.membros FOR DELETE
    USING (eh_admin_do_grupo(grupo_id));

-- Políticas para PARTIDAS
CREATE POLICY "Ver partidas do grupo"
    ON public.partidas FOR SELECT
    USING (eh_membro_do_grupo(grupo_id));

CREATE POLICY "Gerenciar partidas (admin)"
    ON public.partidas FOR ALL
    USING (eh_admin_do_grupo(grupo_id));

-- Políticas para PRESENCAS
CREATE POLICY "Ver presenças das partidas do grupo"
    ON public.presencas FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.partidas p
        WHERE p.id = presencas.partida_id AND eh_membro_do_grupo(p.grupo_id)
    ));

CREATE POLICY "Atualizar própria presença ou admin"
    ON public.presencas FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.membros m
            WHERE m.id = presencas.membro_id AND (m.user_id = auth.uid() OR eh_admin_do_grupo(m.grupo_id))
        )
    );

CREATE POLICY "Inserir presença (admin ou inicialização)"
    ON public.presencas FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.partidas p
        WHERE p.id = presencas.partida_id AND eh_membro_do_grupo(p.grupo_id)
    ));

-- Políticas para MENSALIDADES e TRANSAÇÕES (Caixa)
CREATE POLICY "Ver financeiro do grupo"
    ON public.mensalidades FOR SELECT
    USING (eh_membro_do_grupo(grupo_id));

CREATE POLICY "Gerenciar mensalidades (admin)"
    ON public.mensalidades FOR ALL
    USING (eh_admin_do_grupo(grupo_id));

CREATE POLICY "Ver transações do grupo (membros)"
    ON public.transacoes FOR SELECT
    USING (eh_membro_do_grupo(grupo_id));

CREATE POLICY "Gerenciar transações do grupo (admin)"
    ON public.transacoes FOR ALL
    USING (eh_admin_do_grupo(grupo_id));
