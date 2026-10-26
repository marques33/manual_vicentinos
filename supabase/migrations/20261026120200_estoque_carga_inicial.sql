-- ============================================================================
-- 030 · Despensa — carga inicial a partir do inventário por fotos
-- ----------------------------------------------------------------------------
-- GERADO por supabase/gerar_carga_estoque.py a partir de Inventario_Despensa_Vicentinos.ods.
-- Não editar à mão: corrija a planilha ou o script e gere de novo.
--
-- 42 itens, todos com estimado = true (quantidades estimadas por fotos
-- em 2026-10-26; a conferência física desliga a marca item a item).
-- Fora da carga:
--   nº 42: material da Conferência (cestos de vime decorativos)
--   nº 43: material da Conferência (garrafas decoradas)
--   nº 44: engradados, alguns marcados 'DEVOLVER' — podem ser de terceiros
--
-- Reaplicável: item com origem_ref já existente é ignorado, e só ganha o
-- movimento carga_inicial o item que ainda não tem um.
-- Autor dos registros: o primeiro administrador ativo (criado_por é not null).
-- ============================================================================

do $$
declare
  v_autor uuid;
begin
  select user_id into v_autor
    from public.confrades
   where ativo and papel = 'administrador'
   order by criado_em
   limit 1;

  if v_autor is null then
    raise exception 'carga da despensa: nenhum confrade ativo com papel administrador para assinar os registros';
  end if;

  insert into public.estoque_itens
    (categoria, nome, marcas, unidade, conteudo_por_unidade, local, perecivel,
     observacoes, origem_ref, estimado, criado_por)
  select c.*, true, v_autor
    from (values
    ('cestas', 'Cesta básica 14 itens', 'Vitali', 'cesta', null, 'Bancos e prateleira verde (base)', false, '1 no banco da janela, 2 no banco da parede de vidro, 1 na base da estante verde', 'inventario-2026-10-26#1'),
    ('cestas', 'Cesta básica', 'Qualicesta', 'cesta', null, 'Banco da janela, mesa branca, banco da parede de vidro', false, '2 no banco da janela, 3 na mesa branca, 1 no banco da parede de vidro', 'inventario-2026-10-26#2'),
    ('cestas', 'Cesta básica 18 itens', 'BSB', 'cesta', null, 'Mesa branca, banquinho, estante cinza', false, null, 'inventario-2026-10-26#3'),
    ('cestas', 'Cesta de alimentos', 'Prato Cheio', 'cesta', null, 'Banco da parede de vidro', false, null, 'inventario-2026-10-26#4'),
    ('cestas', 'Cesta montada (sacola Atacadão)', 'Diversas', 'cesta', null, 'Banco da parede de vidro', false, null, 'inventario-2026-10-26#5'),
    ('cestas', 'Cestas de outras marcas / montadas por doadores', 'Diversas', 'cesta', null, 'Banco da janela (9), mesa branca (2), banco da parede de vidro (1)', false, 'Contagem aproximada; algumas estão empilhadas e podem ter sido contadas a mais ou a menos', 'inventario-2026-10-26#6'),
    ('cestas', 'Volumes fechados (sacola laranja, sacola verde, pote plástico, sacola branca)', null, 'volume', null, 'Banco da janela, mesa branca', false, 'Conteúdo não identificável nas fotos', 'inventario-2026-10-26#7'),
    ('alimentos', 'Arroz 5 kg', 'Leeve, Pamparra, Seleção e outras', 'pacote', null, 'Estante cinza direita', false, null, 'inventario-2026-10-26#8'),
    ('alimentos', 'Arroz / açúcar 1 kg avulsos — separar na conferência', 'Pop, Rudá, Seleção', 'pacote', null, 'Banco da parede de vidro (atrás das cestas)', false, 'Linha mista na planilha: arroz e açúcar de 1 kg juntos. Na conferência, zerar este item e lançar as contagens em "Arroz 1 kg" e em "Açúcar cristal 1 kg".', 'inventario-2026-10-26#9'),
    ('alimentos', 'Arroz 1 kg', null, 'pacote', null, 'Banco da parede de vidro (atrás das cestas)', false, 'Criado para receber o arroz da linha mista 9 na conferência.', 'inventario-2026-10-26#9-arroz'),
    ('alimentos', 'Feijão 1 kg', 'Tio Chico e outras', 'pacote', null, 'Estante cinza direita (topo)', false, 'Estimativa: há pilhas ao fundo', 'inventario-2026-10-26#10'),
    ('alimentos', 'Açúcar cristal 1 kg', 'União, Brasília e outras', 'pacote', null, 'Estante cinza direita (2ª prateleira)', false, null, 'inventario-2026-10-26#11'),
    ('alimentos', 'Açúcar cristal 2 kg', 'Diversas', 'pacote', null, 'Estante cinza direita (4ª prateleira)', false, null, 'inventario-2026-10-26#12'),
    ('alimentos', 'Açúcar refinado 1 kg', 'União', 'pacote', null, 'Estante cinza direita (4ª prateleira)', false, null, 'inventario-2026-10-26#13'),
    ('alimentos', 'Sal 1 kg', 'Diversas', 'pacote', null, 'Estante cinza direita (base)', false, null, 'inventario-2026-10-26#14'),
    ('alimentos', 'Farinha de mandioca branca', 'Nerial', 'pacote', null, 'Estante cinza central (2ª prateleira)', false, null, 'inventario-2026-10-26#15'),
    ('alimentos', 'Fubá mimoso fino', 'Diversas', 'pacote', null, 'Estante cinza central (2ª prateleira)', false, null, 'inventario-2026-10-26#16'),
    ('alimentos', 'Flocão de milho para cuscuz', 'Sinhá', 'pacote', null, 'Estante cinza central (3ª prateleira)', false, null, 'inventario-2026-10-26#17'),
    ('alimentos', 'Farinha de trigo (saco grande)', null, 'saco', null, 'Chão, ao lado da mesa branca', false, 'Peso não legível na foto', 'inventario-2026-10-26#18'),
    ('alimentos', 'Macarrão parafuso – fardo fechado 20 × 500 g', 'Safra', 'fardo', '20 × 500 g', 'Chão (mesa branca) e banco da parede de vidro', false, 'Cada fardo = 20 pacotes de 500 g', 'inventario-2026-10-26#19'),
    ('alimentos', 'Macarrão parafuso – fardo aberto', 'Safra', 'pacote', null, 'Estante cinza central (base)', false, 'Fardo parcial; contar pacotes restantes', 'inventario-2026-10-26#20'),
    ('alimentos', 'Macarrão espaguete', 'Diversas', 'pacote', null, 'Estante cinza central (4ª prateleira)', false, null, 'inventario-2026-10-26#21'),
    ('alimentos', 'Macarrão penne', 'Classic', 'pacote', null, 'Estante cinza (base)', false, null, 'inventario-2026-10-26#22'),
    ('alimentos', 'Óleo de soja', 'Vila Velha', 'garrafa', null, 'Estante verde (4ª prateleira)', false, 'Pode haver garrafas atrás da 1ª fileira', 'inventario-2026-10-26#23'),
    ('alimentos', 'Leite UHT integral (caixa 12 × 1 L)', 'Piracanjuba', 'caixa', '12 × 1 L', 'Chão, ao lado da estante verde', false, 'Caixa aberta; conferir quantas unidades restam', 'inventario-2026-10-26#24'),
    ('alimentos', 'Leite UHT integral (caixa 12 × 1 L)', 'Tirol', 'caixa', '12 × 1 L', 'Banquinho ao lado da mesa branca', false, 'Caixa aberta; conferir se ainda contém leite', 'inventario-2026-10-26#25'),
    ('alimentos', 'Café torrado e moído', 'Diversas', 'pacote', null, 'Banco da parede de vidro (dentro de caixa Tirol)', false, null, 'inventario-2026-10-26#26'),
    ('alimentos', 'Ovos (bandeja de 30)', null, 'bandeja', null, 'Mesa branca', true, 'Perecível – verificar validade', 'inventario-2026-10-26#27'),
    ('alimentos', 'Chá Royal Darjeeling', 'Supremo', 'caixa', null, 'Estante cinza central (3ª prateleira)', false, null, 'inventario-2026-10-26#28'),
    ('alimentos', 'Caldo / tempero (pacote dourado)', 'Ilegível', 'pacote', null, 'Estante cinza central (3ª prateleira)', false, null, 'inventario-2026-10-26#29'),
    ('higiene_limpeza', 'Papel higiênico folha dupla 12 rolos', 'Floral', 'fardo', null, 'Estante verde', false, null, 'inventario-2026-10-26#30'),
    ('higiene_limpeza', 'Papel higiênico 4 rolos 30 m', 'Paloma', 'pacote', null, 'Estante verde (3ª prateleira)', false, null, 'inventario-2026-10-26#31'),
    ('higiene_limpeza', 'Papel higiênico folha dupla 4 rolos', 'Floral', 'pacote', null, 'Estante verde (3ª prateleira)', false, null, 'inventario-2026-10-26#32'),
    ('higiene_limpeza', 'Rolos de papel higiênico avulsos', null, 'rolo', null, 'Estante verde (caixa organizadora no topo)', false, null, 'inventario-2026-10-26#33'),
    ('higiene_limpeza', 'Sabão em barra', null, 'pacote', null, 'Estante verde (4ª prateleira)', false, null, 'inventario-2026-10-26#34'),
    ('higiene_limpeza', 'Copos descartáveis 200 ml (pct 100)', null, 'pacote', null, 'Estante cinza central (topo)', false, null, 'inventario-2026-10-26#35'),
    ('utensilios_outros', 'Panela de pressão Turbo 4,5 L (nova, na caixa)', 'Rochedo', 'unidade', null, 'Chão, ao lado do banco da janela', false, null, 'inventario-2026-10-26#36'),
    ('utensilios_outros', 'Cobertores / mantas (embalados)', null, 'volume', null, 'Chão, entre mesa branca e banco', false, 'Contar unidades dentro de cada pacote', 'inventario-2026-10-26#37'),
    ('utensilios_outros', 'Panos de prato / toalhas', null, 'peca', null, 'Mesa branca e estante verde (5ª prateleira)', false, null, 'inventario-2026-10-26#38'),
    ('utensilios_outros', 'Sacos pretos fechados', null, 'volume', null, 'Sob a mesa branca e estante verde', false, 'Conteúdo não identificado', 'inventario-2026-10-26#39'),
    ('utensilios_outros', 'Caixas de papelão fechadas (incl. ''Natal'')', null, 'caixa', null, 'Topo das estantes', false, 'Conteúdo não identificado', 'inventario-2026-10-26#40'),
    ('utensilios_outros', 'Organizador plástico com itens', 'Sanremo', 'unidade', null, 'Topo da estante cinza', false, null, 'inventario-2026-10-26#41')
    ) as c (categoria, nome, marcas, unidade, conteudo_por_unidade, local,
            perecivel, observacoes, origem_ref)
  on conflict (origem_ref) where origem_ref is not null do nothing;

  insert into public.estoque_movimentos
    (item_id, tipo, quantidade, data_movimento, observacao, criado_por)
  select i.id, 'carga_inicial', q.quantidade, date '2026-10-26',
         'Inventário por fotos de 26/10/2026 — quantidade estimada', v_autor
    from (values
    ('inventario-2026-10-26#1', 4),
    ('inventario-2026-10-26#2', 6),
    ('inventario-2026-10-26#3', 3),
    ('inventario-2026-10-26#4', 1),
    ('inventario-2026-10-26#5', 1),
    ('inventario-2026-10-26#6', 12),
    ('inventario-2026-10-26#7', 4),
    ('inventario-2026-10-26#8', 5),
    ('inventario-2026-10-26#9', 10),
    ('inventario-2026-10-26#10', 30),
    ('inventario-2026-10-26#11', 12),
    ('inventario-2026-10-26#12', 14),
    ('inventario-2026-10-26#13', 1),
    ('inventario-2026-10-26#14', 15),
    ('inventario-2026-10-26#15', 12),
    ('inventario-2026-10-26#16', 10),
    ('inventario-2026-10-26#17', 12),
    ('inventario-2026-10-26#18', 2),
    ('inventario-2026-10-26#19', 2),
    ('inventario-2026-10-26#20', 8),
    ('inventario-2026-10-26#21', 10),
    ('inventario-2026-10-26#22', 2),
    ('inventario-2026-10-26#23', 9),
    ('inventario-2026-10-26#24', 1),
    ('inventario-2026-10-26#25', 1),
    ('inventario-2026-10-26#26', 6),
    ('inventario-2026-10-26#27', 1),
    ('inventario-2026-10-26#28', 4),
    ('inventario-2026-10-26#29', 1),
    ('inventario-2026-10-26#30', 5),
    ('inventario-2026-10-26#31', 3),
    ('inventario-2026-10-26#32', 1),
    ('inventario-2026-10-26#33', 6),
    ('inventario-2026-10-26#34', 1),
    ('inventario-2026-10-26#35', 1),
    ('inventario-2026-10-26#36', 1),
    ('inventario-2026-10-26#37', 3),
    ('inventario-2026-10-26#38', 9),
    ('inventario-2026-10-26#39', 3),
    ('inventario-2026-10-26#40', 3),
    ('inventario-2026-10-26#41', 1)
    ) as q (origem_ref, quantidade)
    join public.estoque_itens i on i.origem_ref = q.origem_ref
   where not exists (
     select 1 from public.estoque_movimentos m
      where m.item_id = i.id and m.tipo = 'carga_inicial'
   );
end $$;
