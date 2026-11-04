/* ============================================================================
 * CHERRY MOTION ENGINE — motor único (preview ao vivo + render headless ProRes)
 * Cada elemento (texto OU material/quadro) é uma CAMADA com controles individuais:
 *   texto : text, font, size, color, color2 (cor alternativa)
 *   shape : fill, stroke, w, h
 *   tempo : start (segundo em que inicia), speed (multiplicador de velocidade)
 *   todas : dx, dy (posição), scale (tamanho), visible
 * Controles globais em cfg:
 *   posX, posY, globalScale, globalSpeed, globalDelay, duration
 * Overrides por camada em cfg.layers = { layerId: { prop: valor } }
 * ========================================================================== */
(function (root) {
  'use strict';

  const CW = 1600, CH = 900;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const P = (t, a, b) => clamp((t - a) / (b - a));
  const spring = (t, w = 15, d = 7) => t <= 0 ? 0 : 1 - Math.exp(-d * t) * Math.cos(w * t);
  const backIn = (x, s = 2.0) => (s + 1) * x * x * x - s * x * x;
  const backOut = (x, s = 1.7) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);

  function rr(k, x, y, w, h, r) {
    k.beginPath();
    r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    if (k.roundRect) k.roundRect(x, y, w, h, r); else k.rect(x, y, w, h);
  }
  function hexToRgb(hex) {
    hex = String(hex || '#FFFFFF').replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const n = parseInt(hex, 16) || 0;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const rgba = (hex, a) => { const c = hexToRgb(hex); return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`; };
  function toHex(c) { return '#' + [c.r, c.g, c.b].map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join(''); }
  function mix(h1, h2, t) {
    const a = hexToRgb(h1), b = hexToRgb(h2);
    return toHex({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });
  }

  /* ---------- Gradientes: padrão do template OU derivado da cor escolhida ---------- */
  function paint(ctx, l, key, x1, y1, x2, y2) {
    const val = l[key] || '#FFFFFF';
    const d = l._def;
    const stops = d.grad && d.grad[key];
    if (!stops) return val;
    const g = ctx.createLinearGradient(x1, y1, x2, y2);
    if (String(val).toLowerCase() === String(d[key]).toLowerCase()) {
      stops.forEach(s => g.addColorStop(s[0], s[1]));
    } else {
      const tint = (d.tint && d.tint[key]) || [0.55, 0.3];
      g.addColorStop(0, mix(val, '#FFFFFF', tint[0]));
      g.addColorStop(0.5, val);
      g.addColorStop(1, mix(val, '#000000', tint[1]));
    }
    return g;
  }
  function metallic(ctx, hex, x1, y1, x2, y2) {
    const g = ctx.createLinearGradient(x1, y1, x2, y2);
    g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.35, hex);
    g.addColorStop(0.7, '#D4AF37'); g.addColorStop(1, '#9E7A38');
    return g;
  }

  /* ---------- Definição das camadas por modelo (com start & speed individuais) ---------- */
  const T = (id, label, o) => Object.assign({ id, label, kind: 'text', props: ['text', 'font', 'size', 'color'], weight: 800, start: 0.2, speed: 1.0 }, o);
  const S = (id, label, o) => Object.assign({ id, label, kind: 'shape', props: ['fill', 'stroke'], weight: 0, start: 0.2, speed: 1.0 }, o);

  const GOLD_STROKE = [[0, '#FFE8B5'], [0.5, '#D4AF37'], [1, '#9E7A38']];

  function getDefs(cat, sub) {
    if (cat === 'hook') {
      if (sub === 'dilemma_clash') {
        return [
          S('panel', 'Quadro Editorial Noir', {
            props: ['fill', 'stroke', 'w', 'h'], fill: '#0C0308', stroke: '#D4AF37',
            w: 1220, h: 540, start: 0.02, speed: 1.0,
            labels: { fill: 'Fundo aveludado', stroke: 'Borda dourada fina', w: 'Largura', h: 'Altura' },
            grad: { fill: [[0, 'rgba(22, 6, 14, 0.94)'], [0.5, 'rgba(12, 3, 7, 0.97)'], [1, 'rgba(6, 1, 4, 0.99)']], stroke: [[0, 'rgba(255, 232, 181, 0.2)'], [0.5, '#D4AF37'], [1, 'rgba(158, 122, 56, 0.2)']] },
            tint: { fill: [0.1, 0.3] }
          }),
          T('line1', 'Abertura Editorial', {
            text: 'V O C Ê   É', font: 'MADE TOMMY', size: 36, color: '#DFC89D', weight: 600, start: 0.15, speed: 1.0,
            grad: { color: [[0, '#FFFFFF'], [0.5, '#DFC89D'], [1, '#B89358']] }
          }),
          T('hero_lash', 'Título Serifado (LASH)', {
            props: ['text', 'font', 'size', 'color'], text: 'LASH', font: 'Cinzel', size: 104, color: '#FAF6EE', weight: 700, start: 0.40, speed: 1.0,
            grad: { color: [[0, '#FFFFFF'], [0.35, '#FFE8B5'], [0.7, '#DFC89D'], [1, '#C5A76E']] }
          }),
          T('script_connector', 'Ligatura Caligráfica (ou só)', {
            text: 'ou só', font: 'Pinyon Script', size: 84, color: '#D4AF37', weight: 400, start: 0.75, speed: 1.0,
            grad: { color: [[0, '#FFE8B5'], [0.6, '#D4AF37'], [1, '#9E7A38']] }
          }),
          T('line_punch', 'Pergunta Provocativa', {
            props: ['text', 'font', 'size', 'color', 'color2', 'sweep'], text: 'CULPA A COLA?', font: 'Cinzel', size: 76, color: '#FAF6EE', color2: '#D81B60', weight: 700, sweep: true, start: 1.20, speed: 1.0,
            labels: { color: 'Cor "CULPA A"', color2: 'Cor "COLA?"', sweep: 'Brilho de Seda (Light Gleam)' },
            grad: { color2: [[0, '#FF5398'], [0.4, '#D81B60'], [1, '#941843']] }
          }),
          S('double_rule', 'Filete Dourado Inferior', {
            props: ['stroke', 'w'], stroke: '#D4AF37', w: 560, start: 1.45, speed: 1.0,
            labels: { stroke: 'Cor do filete', w: 'Comprimento' }
          })
        ];
      }
      if (sub === 'frameless_kinetic') {
        return [
          T('line1', 'Linha 1 — Palavra por Palavra (Optical Blur)', {
            props: ['text', 'font', 'size', 'color'],
            text: 'VOCÊ SABE TRABALHAR', font: 'SF Pro Display', size: 56, color: '#FAF6EE', weight: 800,
            x: 0, y: -58, start: 0.06, speed: 1.0,
            grad: { color: [[0, '#FFFFFF'], [0.65, '#FAF6EE'], [1, '#E2D8C5']] }
          }),
          T('prefix', 'Linha 2 — Conector Editorial (com o)', {
            props: ['text', 'font', 'size', 'color'],
            text: 'com o', font: 'Playfair Display', size: 80, color: '#E8D1A7', weight: 600,
            x: 0, y: 36, start: 0.34, speed: 1.0,
            grad: { color: [[0, '#FFF8E6'], [0.55, '#E8D1A7'], [1, '#C49E5A']] }
          }),
          T('hero', 'Destaque Letra por Letra (FIO Y?)', {
            props: ['text', 'font', 'size', 'color', 'color2', 'sweep'],
            text: 'FIO Y?', font: 'SF Pro Display', size: 122, color: '#FFFFFF', color2: '#FFD166', weight: 900, sweep: true,
            x: 0, y: 38, start: 0.48, speed: 1.0,
            charColors: { 4: '#FFD166', 5: '#FFD166' },
            labels: { color: 'Cor "FIO"', color2: 'Cor "Y?" (Ouro)', sweep: 'Feixe de Luz (Light Gleam)' },
            grad: {
              color: [[0, '#FFFFFF'], [0.65, '#FAF6EE'], [1, '#E0D6C6']],
              color2: [[0, '#FFFDF5'], [0.35, '#FFE8A3'], [0.7, '#FFD166'], [1, '#C99738']]
            }
          }),
          S('swash', 'Filete Luminoso Curvo sob FIO Y?', {
            props: ['stroke', 'w'], stroke: '#FFD166', w: 390, start: 0.78, speed: 1.0,
            labels: { stroke: 'Cor do feixe', w: 'Comprimento' }
          })
        ];
      }
      if (sub === 'horizon_split_hero') {
        return [
          S('divider', 'Linha Horizonte Dourada (Split Mask)', {
            props: ['stroke', 'w'], stroke: '#D4AF37', w: 780, start: 0.02, speed: 1.0,
            labels: { stroke: 'Cor do laser dourado', w: 'Largura da linha' }
          }),
          S('top_badge', ' Cápsula Superior (Setup)', {
            props: ['fill', 'stroke', 'h'], fill: '#0E040A', stroke: '#D4AF37', h: 72, start: 0.16, speed: 1.0,
            labels: { fill: 'Fundo da cápsula superior', stroke: 'Borda superior', h: 'Altura' },
            grad: {
              fill: [[0, 'rgba(28, 8, 19, 0.95)'], [1, 'rgba(10, 3, 7, 0.98)']],
              stroke: [[0, 'rgba(255, 238, 195, 0.25)'], [0.5, '#D4AF37'], [1, 'rgba(255, 238, 195, 0.25)']]
            },
            tint: { fill: [0.12, 0.3] }
          }),
          T('line1', 'Texto Superior (Pergunta)', {
            props: ['text', 'font', 'size', 'color', 'color2'],
            text: 'VOCÊ SABE TRABALHAR COM O', font: 'SF Pro Display', size: 38, color: '#FAF6EE', color2: '#FFD166', weight: 800,
            x: 0, y: -92, start: 0.16, speed: 1.0,
            labels: { color: 'Cor principal', color2: 'Cor "COM O"' }
          }),
          S('backdrop', 'Base Glass Inferior (Contraste Hero)', {
            props: ['fill', 'stroke', 'w', 'h'], fill: '#0C0308', stroke: '#D4AF37',
            w: 680, h: 176, start: 0.34, speed: 1.0,
            labels: { fill: 'Fundo do Hero', stroke: 'Borda dourada', w: 'Largura', h: 'Altura' },
            grad: {
              fill: [[0, 'rgba(26, 7, 17, 0.96)'], [0.6, 'rgba(12, 3, 8, 0.98)'], [1, 'rgba(6, 1, 4, 0.99)']],
              stroke: [[0, 'rgba(255, 238, 195, 0.6)'], [0.5, '#D4AF37'], [1, 'rgba(158, 122, 56, 0.3)']]
            },
            tint: { fill: [0.12, 0.3] }
          }),
          T('hero', 'Título Gigante (FIO Y?)', {
            props: ['text', 'font', 'size', 'color', 'color2', 'sweep'],
            text: 'FIO Y?', font: 'SF Pro Display', size: 138, color: '#FAF6EE', color2: '#FFD166', weight: 900, sweep: true,
            x: 0, y: 66, start: 0.34, speed: 1.0,
            charColors: { 4: '#FFD166', 5: '#FFD166' },
            labels: { color: 'Cor "FIO"', color2: 'Cor "Y?" (Ouro)', sweep: 'Feixe Especular (Light Gleam)' },
            grad: {
              color: [[0, '#FFFFFF'], [0.6, '#FAF6EE'], [1, '#DFD5C5']],
              color2: [[0, '#FFFFFF'], [0.3, '#FFE8B5'], [0.65, '#FFD166'], [1, '#C89B3C']]
            }
          })
        ];
      }
      if (sub === 'y_lash_precision') {
        return [
          S('panel', 'Barra Glass Noir (Fundo)', {
            props: ['fill', 'stroke', 'w', 'h'], fill: '#0E040A', stroke: '#D4AF37',
            w: 960, h: 256, start: 0.02, speed: 1.0,
            labels: { fill: 'Cor do vidro noir', stroke: 'Borda especular', w: 'Largura', h: 'Altura' },
            grad: {
              fill: [[0, 'rgba(28, 8, 19, 0.95)'], [0.5, 'rgba(14, 4, 10, 0.97)'], [1, 'rgba(7, 2, 5, 0.99)']],
              stroke: [[0, 'rgba(255, 238, 195, 0.55)'], [0.5, '#D4AF37'], [1, 'rgba(158, 122, 56, 0.35)']]
            },
            tint: { fill: [0.12, 0.3] }
          }),
          T('line1', 'Linha 1 — Palavra por Palavra (Blur Focus)', {
            props: ['text', 'font', 'size', 'color'],
            text: 'VOCÊ SABE TRABALHAR', font: 'SF Pro Display', size: 52, color: '#FAF6EE', weight: 800,
            x: 0, y: -48, start: 0.10, speed: 1.0,
            grad: { color: [[0, '#FFFFFF'], [0.6, '#FAF6EE'], [1, '#E2D9C8']] }
          }),
          T('prefix', 'Linha 2 — Conector Deslizante (Push)', {
            props: ['text', 'font', 'size', 'color'],
            text: 'com o', font: 'Playfair Display', size: 56, color: '#DFC89D', weight: 700,
            x: 0, y: 44, start: 0.42, speed: 1.0,
            grad: { color: [[0, '#FFF3D6'], [0.5, '#DFC89D'], [1, '#C29B58']] }
          }),
          S('pill', 'Cápsula Expansiva (Unfold Mask)', {
            props: ['fill', 'stroke', 'h'], fill: '#DFC89D', stroke: '#FFFDF7', h: 84, start: 0.68, speed: 1.0,
            labels: { fill: 'Ouro da cápsula', stroke: 'Brilho da borda', h: 'Altura da cápsula' },
            grad: { fill: [[0, '#FFF7DF'], [0.45, '#E7CE9A'], [1, '#C49A45']] },
            tint: { fill: [0.45, 0.18] }
          }),
          T('hero', 'Destaque Impacto (Dentro da Cápsula)', {
            props: ['text', 'font', 'size', 'color', 'sweep'],
            text: 'FIO Y?', font: 'SF Pro Display', size: 62, color: '#14060C', weight: 900, sweep: true,
            x: 0, y: 44, start: 0.68, speed: 1.0,
            labels: { color: 'Cor do texto', sweep: 'Feixe Especular (Light Gleam)' }
          })
        ];
      }
      const wide = sub === 'widescreen';
      const d = [S('panel', 'Quadro (caixa de fundo)', {
        props: ['fill', 'stroke', 'w', 'h'], fill: '#1A080E', stroke: '#D4AF37',
        w: wide ? 1260 : 1120, h: wide ? 380 : 480, start: 0.02, speed: 1.0,
        labels: { fill: 'Cor do fundo', stroke: 'Cor da borda', w: 'Largura', h: 'Altura' },
        grad: { fill: [[0, 'rgba(42, 11, 23, 0.95)'], [0.5, 'rgba(26, 8, 14, 0.96)'], [1, 'rgba(16, 4, 8, 0.98)']], stroke: GOLD_STROKE },
        tint: { fill: [0.14, 0.35] }
      })];
      if (wide) d.push(S('divider', 'Divisória central', { props: ['stroke', 'w'], stroke: '#D4AF37', w: 1020, start: 0.15, speed: 1.0, labels: { stroke: 'Cor da linha', w: 'Comprimento' } }));
      d.push(T('line1', 'Linha 1 — Abertura', { text: 'QUANTO CUSTA', font: 'Coolvetica', size: 68, color: '#FAF6EE', weight: 800, start: 0.05, speed: 1.0 }));
      if (!wide) d.push(T('line2', 'Linha 2 — Subtítulo', { text: '✦ A SUA ✦', font: 'MADE TOMMY', size: 44, color: '#C5A76E', weight: 700, start: 0.55, speed: 1.0 }));
      d.push(T('hero', 'Palavra Destaque (Hero)', {
        props: ['text', 'font', 'size', 'color', 'sweep'], text: 'SOFT SNOW', font: 'Coolvetica', size: 110, color: '#FFD166', weight: 900, sweep: true, start: 0.85, speed: 1.0,
        labels: { sweep: 'Feixe de luz (light sweep)' },
        grad: { color: [[0, '#FFFFFF'], [0.35, '#FFE8B5'], [0.7, '#FFD166'], [1, '#FFB703']] }
      }));
      if (!wide) d.push(T('line4', 'Linha 4 — Fechamento', {
        text: 'POR ATENDIMENTO?', font: 'Coolvetica', size: 92, color: '#FF2E7E', weight: 900, start: 1.65, speed: 1.0,
        grad: { color: [[0, '#FF2E7E'], [0.5, '#FF5398'], [1, '#FFD166']] }
      }));
      return d;
    }

    if (cat === 'haute') {
      const is05b = sub === '05b';
      const d = [
        T('serif', 'Título Serifado', { text: 'ALTA FIXAÇÃO', font: 'Cinzel', size: 54, color: '#EBE7DF', weight: 700, start: 0.20, speed: 1.0 }),
        T('script', 'Assinatura Cursiva', { text: 'perfeita', font: 'Pinyon Script', size: 120, color: '#D4AF37', weight: 600, start: is05b ? 0.25 : 0.65, speed: 1.0 })
      ];
      if (sub === '05c') d.push(S('swash', 'Fita / Sublinhado Swash', { props: ['stroke', 'w'], stroke: '#D4AF37', w: 340, start: 0.70, speed: 1.0, labels: { stroke: 'Cor da fita', w: 'Comprimento' } }));
      if (sub === '05d') d.push(S('rule', 'Filetes Dourados (cima/baixo)', { props: ['stroke', 'w'], stroke: '#D4AF37', w: 520, start: 0.10, speed: 1.0, labels: { stroke: 'Cor dos filetes', w: 'Comprimento' } }));
      if (!is05b) d.push(S('spark', 'Brilho (sparkle)', { props: ['fill', 'w'], fill: '#FFFFFF', w: 10, start: 0.75, speed: 1.0, labels: { fill: 'Cor do brilho', w: 'Diâmetro' } }));
      return d;
    }

    if (cat === 'viral') {
      if (sub === 'snap_pop') return [
        T('w1', 'Palavra 1 (base)', { text: 'FIOS', font: 'Montserrat', size: 78, color: '#FFFFFF', weight: 900, start: 0.20, speed: 1.0 }),
        T('w2', 'Palavra 2 (hit dourado)', { props: ['text', 'font', 'size', 'color', 'color2'], text: 'FININHOS', font: 'Montserrat', size: 78, color: '#FFD166', color2: '#FFFFFF', weight: 900, start: 0.80, speed: 1.0, labels: { color: 'Cor após o hit', color2: 'Cor antes do hit' } })
      ];
      if (sub === 'pill_box') return [
        T('w1', 'Palavra 1 (base)', { text: 'OLHAR', font: 'Montserrat', size: 68, color: '#FFFFFF', weight: 900, start: 0.20, speed: 1.0 }),
        S('pill', 'Caixa / Pílula', { props: ['fill', 'stroke', 'h'], fill: '#DFC89D', stroke: '#FFFFFF', h: 92, start: 0.75, speed: 1.0, labels: { fill: 'Cor da caixa', stroke: 'Cor da borda', h: 'Altura' } }),
        T('w2', 'Palavra 2 (dentro da caixa)', { props: ['text', 'font', 'size', 'color', 'color2'], text: 'IMPECÁVEL', font: 'Montserrat', size: 68, color: '#1A130B', color2: '#FFFFFF', weight: 900, start: 0.20, speed: 1.0, labels: { color: 'Cor sobre a caixa', color2: 'Cor antes da caixa' } })
      ];
      if (sub === 'kinetic_slam') return [
        T('top', 'Texto Superior (subtítulo)', { text: 'SEM DESMANCHAR', font: 'Montserrat', size: 46, color: '#FFFFFF', weight: 700, start: 0.20, speed: 1.0 }),
        T('slam', 'Palavra Slam (impacto 3D)', { text: 'NUNCA!', font: 'Montserrat', size: 108, color: '#FF2E7E', weight: 900, start: 0.75, speed: 1.0 }),
        S('shock', 'Onda de Choque (anel)', { props: ['stroke', 'w'], stroke: '#FF2E7E', w: 220, start: 0.80, speed: 1.0, labels: { stroke: 'Cor do anel', w: 'Expansão (px)' } })
      ];
      if (sub === 'luxury_script') return [
        T('bg', 'Fundo Cursivo (marca d\'água)', { text: 'Exclusivo', font: 'Pinyon Script', size: 190, color: '#DFC89D', weight: 400, start: 0.05, speed: 1.0 }),
        T('fg', 'Título Frontal Serifado', { text: 'EXCLUSIVO', font: 'Playfair Display', size: 76, color: '#FAF6EE', weight: 800, start: 0.42, speed: 1.0 })
      ];
    }

    if (cat === 'element') {
      if (sub === 'pop') return [
        S('box', 'Caixa do Preço', { props: ['fill', 'stroke', 'w', 'h'], fill: '#DFC89D', stroke: '#D4B373', w: 360, h: 100, start: 0.28, speed: 1.0, labels: { fill: 'Cor da caixa', stroke: 'Cor da borda', w: 'Largura', h: 'Altura' }, grad: { fill: [[0, '#FAF6EE'], [1, '#DFC89D']] }, tint: { fill: [0.6, 0.12] } }),
        T('value', 'Valor / Preço', { text: 'R$ 69,90', font: 'Montserrat', size: 58, color: '#382813', weight: 900, start: 0.28, speed: 1.0 })
      ];
      if (sub === 'slash') return [
        T('old', 'Preço Anterior (De)', { text: 'De: R$ 120', font: 'Montserrat', size: 32, color: '#A89279', weight: 700, start: 0.20, speed: 1.0 }),
        S('strike', 'Risco Diagonal', { props: ['stroke', 'w'], stroke: '#FF2E7E', w: 180, start: 1.10, speed: 1.0, labels: { stroke: 'Cor do risco', w: 'Comprimento' } }),
        S('box', 'Caixa do Preço Novo', { props: ['fill', 'stroke', 'w', 'h'], fill: '#DFC89D', stroke: '#FFD166', w: 230, h: 84, start: 1.35, speed: 1.0, labels: { fill: 'Cor da caixa', stroke: 'Cor da borda', w: 'Largura', h: 'Altura' }, grad: { fill: [[0, '#FAF6EE'], [1, '#DFC89D']] }, tint: { fill: [0.6, 0.12] } }),
        T('new', 'Preço Novo (Por)', { text: 'R$ 69,90', font: 'Montserrat', size: 42, color: '#382813', weight: 900, start: 1.35, speed: 1.0 })
      ];
      if (sub === 'count_up') return [
        T('value', 'Número (valor alvo)', { props: ['text', 'font', 'size', 'color', 'color2'], text: '15800', font: 'Montserrat', size: 66, color: '#FFFFFF', color2: '#FFD166', weight: 900, start: 0.45, speed: 1.0, labels: { text: 'Número alvo', color: 'Cor durante a contagem', color2: 'Cor ao pousar' } }),
        T('unit', 'Unidade / Sufixo', { props: ['text', 'font', 'size', 'color', 'color2'], text: 'FIOS', font: 'Montserrat', size: 66, color: '#FFFFFF', color2: '#FFD166', weight: 900, start: 0.45, speed: 1.0, labels: { color: 'Cor durante a contagem', color2: 'Cor ao pousar' } }),
        S('bar', 'Barra de Progresso', { props: ['fill', 'stroke', 'w', 'h'], fill: '#FFD166', stroke: '#FFFFFF', w: 400, h: 8, start: 0.45, speed: 1.0, labels: { fill: 'Cor da barra', stroke: 'Cor da trilha', w: 'Largura', h: 'Altura' } })
      ];
      if (sub === 'highlighter') return [
        S('marker', 'Marca-Texto (tarja)', { props: ['fill', 'h'], fill: '#FFD166', h: 55, start: 0.45, speed: 1.0, labels: { fill: 'Cor da tarja', h: 'Altura' }, grad: { fill: [[0, '#FFE8B5'], [1, '#FFD166']] }, tint: { fill: [0.5, 0.1] } }),
        T('word', 'Palavra', { text: 'IMPECÁVEL', font: 'Montserrat', size: 74, color: '#1A130B', weight: 900, start: 0.20, speed: 1.0 })
      ];
      if (sub === 'stamp') return [
        S('disc', 'Selo (disco)', { props: ['fill', 'stroke', 'w'], fill: '#FAF6EE', stroke: '#D4AF37', w: 190, start: 0.35, speed: 1.0, labels: { fill: 'Cor do selo', stroke: 'Cor da borda', w: 'Diâmetro' } }),
        T('line1', 'Texto Principal', { text: '100% GARANTIDO', font: 'Montserrat', size: 19, color: '#382813', weight: 900, start: 0.35, speed: 1.0 }),
        T('line2', 'Subtítulo do Selo', { text: 'CHERRY LASH', font: 'MADE TOMMY', size: 18, color: '#C5A76E', weight: 700, start: 0.35, speed: 1.0 })
      ];
      if (sub === 'lower_third') return [
        S('plate', 'Placa (fundo)', { props: ['fill', 'stroke', 'w', 'h'], fill: '#16060E', stroke: '#FFD166', w: 520, h: 84, start: 0.20, speed: 1.0, labels: { fill: 'Cor do fundo', stroke: 'Cor da borda', w: 'Largura', h: 'Altura' } }),
        T('name', 'Nome', { text: 'GEOVANA PADOCA', font: 'Coolvetica', size: 32, color: '#FAF6EE', weight: 800, start: 0.20, speed: 1.0 }),
        T('role', 'Cargo / Título', { text: 'ESPECIALISTA EM EXTENSÃO', font: 'MADE TOMMY', size: 18, color: '#C5A76E', weight: 700, start: 0.28, speed: 1.0 })
      ];
    }

    if (cat === 'text_anim') {
      if (sub === 'karaoke_bounce') {
        return [
          S('badge', 'Fundo Cápsula / Badge', {
            props: ['fill', 'stroke', 'w', 'h'], fill: 'rgba(18, 4, 12, 0.75)', stroke: 'rgba(255, 209, 102, 0.25)',
            w: 1280, h: 140, start: 0.05, speed: 1.0,
            labels: { fill: 'Fundo da Cápsula', stroke: 'Borda Sutil', w: 'Largura', h: 'Altura' }
          }),
          T('text', 'Frase Principal (*palavra* grifa)', {
            props: ['text', 'font', 'size', 'color', 'color2', 'glow'],
            text: 'O *SEGREDO* DA *RETENÇÃO* PERFEITA', font: 'Syne', size: 76, color: '#FAF6EE', color2: '#FFD166', weight: 800,
            start: 0.15, speed: 1.0, glow: 28,
            labels: { text: 'Frase (*palavra* grifa)', color: 'Cor Base (Texto)', color2: 'Cor de Destaque (*)', glow: 'Intensidade Glow' }
          })
        ];
      }
      if (sub === 'sliding_pill') {
        return [
          S('pill', 'Pílula Deslizante (Highlight Box)', {
            props: ['fill', 'stroke', 'h'], fill: '#FFD166', stroke: '#FFFDF5', h: 96,
            start: 0.15, speed: 1.0,
            labels: { fill: 'Cor da Pílula', stroke: 'Borda da Pílula', h: 'Altura da Pílula' }
          }),
          T('text', 'Frase Principal (*palavra* grifa)', {
            props: ['text', 'font', 'size', 'color', 'color2'],
            text: 'DOMINE O *ALGORITMO* HOJE', font: 'Montserrat', size: 72, color: '#FAF6EE', color2: '#12040C', weight: 900,
            start: 0.15, speed: 1.0,
            labels: { text: 'Frase (*palavra* grifa)', color: 'Cor do Texto Normal', color2: 'Cor Sob a Pílula' }
          })
        ];
      }
      if (sub === 'blur_glow_in') {
        return [
          T('text', 'Frase Principal (*palavra* grifa)', {
            props: ['text', 'font', 'size', 'color', 'color2', 'glow'],
            text: 'CRIE VÍDEOS COM *ALTO IMPACTO*', font: 'Syne', size: 76, color: '#FAF6EE', color2: '#FF2E7E', weight: 800,
            start: 0.15, speed: 1.0, glow: 32,
            labels: { text: 'Frase (*palavra* grifa)', color: 'Cor Base', color2: 'Cor de Destaque (*)', glow: 'Intensidade Glow & Blur' }
          }),
          T('sub', 'Subtítulo Editorial (Inferior)', {
            props: ['text', 'font', 'size', 'color'],
            text: 'ELEVEN PERCENT STYLE • ULTRA RETENÇÃO', font: 'Montserrat', size: 24, color: '#DFC89D', weight: 700,
            start: 0.65, speed: 1.0
          })
        ];
      }
      if (sub === 'kinetic_stack') {
        return [
          T('line1', 'Linha 1 — Abertura', {
            props: ['text', 'font', 'size', 'color'],
            text: 'SE VOCÊ QUER', font: 'Montserrat', size: 50, color: '#FAF6EE', weight: 800,
            start: 0.10, speed: 1.0
          }),
          T('line2', 'Linha 2 — Impacto Hero (*palavra* grifa)', {
            props: ['text', 'font', 'size', 'color', 'color2', 'glow'],
            text: 'MULTIPLICAR SUAS *VENDAS*', font: 'Syne', size: 92, color: '#FAF6EE', color2: '#FFD166', weight: 900,
            start: 0.35, speed: 1.0, glow: 30,
            labels: { text: 'Texto Hero (*palavra* grifa)', color: 'Cor Base', color2: 'Cor Destaque (*)', glow: 'Intensidade Glow' }
          }),
          T('line3', 'Linha 3 — Fechamento', {
            props: ['text', 'font', 'size', 'color'],
            text: 'COMECE PELO DESIGN CERTO', font: 'Montserrat', size: 44, color: '#DFC89D', weight: 700,
            start: 0.65, speed: 1.0
          })
        ];
      }
      if (sub === 'clean_callout') {
        return [
          S('guide', 'Linha Guia & Ponto (Callout)', {
            props: ['stroke', 'fill', 'w'], stroke: '#FFD166', fill: '#FF2E7E', w: 860,
            start: 0.05, speed: 1.0,
            labels: { stroke: 'Cor da Linha Guia', fill: 'Cor do Ponto / Target', w: 'Comprimento da Linha' }
          }),
          T('title', 'Título Principal (*palavra* grifa)', {
            props: ['text', 'font', 'size', 'color', 'color2', 'glow'],
            text: 'ESTRUTURA DE *ALTA RETENÇÃO*', font: 'Syne', size: 66, color: '#FAF6EE', color2: '#FFD166', weight: 800,
            start: 0.25, speed: 1.0, glow: 24,
            labels: { text: 'Título (*palavra* grifa)', color: 'Cor Base', color2: 'Cor Destaque (*)', glow: 'Glow do Título' }
          }),
          T('sub', 'Subtítulo Descritivo', {
            props: ['text', 'font', 'size', 'color'],
            text: 'METODOLOGIA VALIDADA EM MAIS DE 100 CANAIS', font: 'Montserrat', size: 22, color: '#A39281', weight: 600,
            start: 0.50, speed: 1.0
          })
        ];
      }
      if (sub === 'typewriter_neon') {
        return [
          S('panel', 'Badge de Fundo (Terminal Glass)', {
            props: ['fill', 'stroke', 'w', 'h'], fill: '#0E040B', stroke: '#331123',
            w: 1240, h: 120, start: 0.02, speed: 1.0,
            labels: { fill: 'Fundo do Terminal', stroke: 'Borda do Terminal', w: 'Largura', h: 'Altura' }
          }),
          T('text', 'Texto Typewriter (*palavra* grifa)', {
            props: ['text', 'font', 'size', 'color', 'color2', 'glow'],
            text: 'DIGITANDO O *CÓDIGO SECRETO* DO SUCESSO...', font: 'JetBrains Mono', size: 50, color: '#FAF6EE', color2: '#22D3EE', weight: 700,
            start: 0.15, speed: 1.0, glow: 20,
            labels: { text: 'Texto (*palavra* grifa)', color: 'Cor do Texto', color2: 'Cor Destaque & Cursor', glow: 'Glow do Cursor' }
          })
        ];
      }
      if (sub === 'wave_kinetic') {
        return [
          T('text', 'Texto Ondulante (*palavra* grifa)', {
            props: ['text', 'font', 'size', 'color', 'color2', 'glow'],
            text: 'ONDAS SUAVES DE *RETENÇÃO CONTÍNUA*', font: 'Montserrat', size: 74, color: '#FAF6EE', color2: '#FFD166', weight: 900,
            start: 0.12, speed: 1.0, glow: 26,
            labels: { text: 'Texto (*palavra* grifa)', color: 'Cor Base', color2: 'Cor de Destaque (*)', glow: 'Intensidade Glow' }
          }),
          T('sub', 'Subtítulo Flutuante', {
            props: ['text', 'font', 'size', 'color'],
            text: 'FLUXO HIPNÓTICO • AUTOEDIT AI', font: 'Inter', size: 24, color: '#DFC89D', weight: 700,
            start: 0.45, speed: 1.0
          })
        ];
      }
      if (sub === 'split_reveal') {
        return [
          S('line', 'Linha Central (Laser Dourado)', {
            props: ['stroke', 'w'], stroke: '#FFD166', w: 980,
            start: 0.05, speed: 1.0,
            labels: { stroke: 'Cor da Linha Central', w: 'Largura da Linha' }
          }),
          T('title', 'Título Superior (*palavra* grifa)', {
            props: ['text', 'font', 'size', 'color', 'color2', 'glow'],
            text: 'A REVOLUÇÃO DO *DESIGN CINÉTICO*', font: 'Syne', size: 70, color: '#FAF6EE', color2: '#FFD166', weight: 900,
            start: 0.22, speed: 1.0, glow: 26,
            labels: { text: 'Título (*palavra* grifa)', color: 'Cor Base', color2: 'Cor de Destaque (*)', glow: 'Intensidade Glow' }
          }),
          T('sub', 'Subtítulo Inferior', {
            props: ['text', 'font', 'size', 'color'],
            text: 'PRECISÃO FRAME A FRAME PARA CRIADORES', font: 'Montserrat', size: 24, color: '#DFC89D', weight: 700,
            start: 0.35, speed: 1.0
          })
        ];
      }
    }
    return [];
  }

  const SUITES = {
    hook: {
      name: 'Hooks Interrogativos (#07 a #11)', models: [
        { id: 'frameless_kinetic', label: '#11 Kinetic Sem Caixa (Fio Y)', dur: 3.4, rest: 2.5 },
        { id: 'horizon_split_hero', label: '#10 Horizon Split-Mask (Fio Y)', dur: 3.4, rest: 2.5 },
        { id: 'y_lash_precision', label: '#09 Kinetic Focus & Capsule', dur: 3.4, rest: 2.5 },
        { id: 'dilemma_clash', label: '#08 Editorial Dilemma (Haute Noir)', dur: 3.4, rest: 2.7 },
        { id: 'stack_hero', label: '#07B Stack Hero (Destaque)', dur: 2.95, rest: 2.4 },
        { id: 'compact', label: '#07A Natural Compacto', dur: 2.95, rest: 2.4 },
        { id: 'widescreen', label: '#07C Power Widescreen', dur: 2.95, rest: 2.4 }
      ]
    },
    haute: {
      name: 'Haute Couture & Assinaturas (#05)', models: [
        { id: '05a', label: '05A Assinatura Cruzada', dur: 3.0, rest: 2.0 },
        { id: '05b', label: '05B Rhode Soft Focus', dur: 3.0, rest: 2.0 },
        { id: '05c', label: '05C Swash Ribbon', dur: 3.0, rest: 2.0 },
        { id: '05d', label: '05D Gold Knockout', dur: 3.0, rest: 2.0 }
      ]
    },
    viral: {
      name: 'Templates Virais (T1-T4)', models: [
        { id: 'kinetic_slam', label: 'T3 Kinetic Slam (Impacto 3D)', dur: 3.0, rest: 1.9 },
        { id: 'snap_pop', label: 'T1 Snap-Pop (Hormozi)', dur: 3.0, rest: 1.9 },
        { id: 'pill_box', label: 'T2 Pill-Box (Vox High-End)', dur: 3.0, rest: 1.9 },
        { id: 'luxury_script', label: 'T4 Luxury Script (Write-On)', dur: 3.0, rest: 2.4 }
      ]
    },
    element: {
      name: 'Preços & Elementos (#01-#06)', models: [
        { id: 'pop', label: '#01 Luxury Price Pop', dur: 4.3, rest: 1.5 },
        { id: 'slash', label: '#02 Price Slash (De/Por)', dur: 4.5, rest: 2.5 },
        { id: 'count_up', label: '#03 Count-up Odômetro', dur: 4.7, rest: 3.4 },
        { id: 'highlighter', label: '#04 Highlighter Marker', dur: 4.2, rest: 1.6 },
        { id: 'stamp', label: '#05 Selo Selado (Stamp)', dur: 4.3, rest: 1.5 },
        { id: 'lower_third', label: '#06 Golden Lower-Third', dur: 4.3, rest: 1.2 }
      ]
    },
    text_anim: {
      name: 'Text Animation (AutoEdit)', models: [
        { id: 'karaoke_bounce', label: '#01 Karaoke Word Bounce', dur: 3.2, rest: 2.2 },
        { id: 'sliding_pill', label: '#02 Sliding Highlight Box', dur: 3.2, rest: 2.4 },
        { id: 'blur_glow_in', label: '#03 Cinematic Blur & Glow', dur: 3.2, rest: 2.2 },
        { id: 'kinetic_stack', label: '#04 Kinetic Typography Stack', dur: 3.2, rest: 2.2 },
        { id: 'clean_callout', label: '#05 Minimal Clean Callout', dur: 3.4, rest: 2.4 },
        { id: 'typewriter_neon', label: '#06 Typewriter Pro + Cursor', dur: 3.2, rest: 2.5 },
        { id: 'wave_kinetic', label: '#07 Floating Wave Text', dur: 3.4, rest: 2.5 },
        { id: 'split_reveal', label: '#08 Split-Mask Cinematic Title', dur: 3.2, rest: 2.2 }
      ]
    }
  };

  /* ---------- Resolução das camadas (padrão + overrides) ---------- */
  function resolve(cat, sub, cfg) {
    const defs = getDefs(cat, sub);
    const ov = (cfg && cfg.layers) || {};
    const out = {};
    defs.forEach(d => {
      const o = ov[d.id] || {};
      const l = Object.assign({ dx: 0, dy: 0, scale: 1, visible: true }, d, o);
      l.size = parseFloat(l.size) || d.size;
      l.dx = parseFloat(l.dx) || 0; l.dy = parseFloat(l.dy) || 0;
      l.scale = parseFloat(l.scale) || 1;
      l.w = parseFloat(l.w) || d.w; l.h = parseFloat(l.h) || d.h;
      l.start = (l.start !== undefined && l.start !== '' && !isNaN(parseFloat(l.start))) ? parseFloat(l.start) : d.start;
      l.speed = (l.speed !== undefined && l.speed !== '' && !isNaN(parseFloat(l.speed))) ? Math.max(0.1, parseFloat(l.speed)) : (d.speed || 1.0);
      l.glow = (l.glow !== undefined && l.glow !== '' && !isNaN(parseFloat(l.glow))) ? parseFloat(l.glow) : (d.glow || 0);
      if (o.charColors) l.charColors = Object.assign({}, o.charColors);
      else if (d.charColors) l.charColors = Object.assign({}, d.charColors);
      l._def = d;
      out[d.id] = l;
    });
    return out;
  }

  // Tempo efetivo local da camada l: inicia em l.start com velocidade l.speed
  function elapsed(u, l) {
    if (!l) return 0;
    return (u - l.start) * l.speed;
  }

  /* ---------- Helpers de Texto Cinético & Destaque (*asteriscos*) ---------- */
  function parseTextWithHighlights(rawText) {
    if (!rawText) return [];
    const tokens = [];
    const regex = /\*([^*]+)\*|([^*]+)/g;
    let m;
    while ((m = regex.exec(String(rawText))) !== null) {
      if (m[1] !== undefined) {
        const words = m[1].trim().split(/\s+/).filter(Boolean);
        words.forEach(w => tokens.push({ text: w, highlight: true }));
      } else if (m[2] !== undefined) {
        const words = m[2].trim().split(/\s+/).filter(Boolean);
        words.forEach(w => tokens.push({ text: w, highlight: false }));
      }
    }
    return tokens;
  }

  function cleanAsterisks(str) {
    return String(str || '').replace(/\*/g, '');
  }

  function parseCharTokens(rawText, layer) {
    const raw = String(rawText || '');
    const charColors = (layer && layer.charColors) || null;
    const hasCustomCharColors = charColors && Object.keys(charColors).length > 0;
    const defaultColor = (layer && layer.color) || '#FFFFFF';
    const highlightColor = (layer && layer.color2) || '#FFD166';

    const tokens = [];
    let isInsideAsterisk = false;
    let cleanIdx = 0;

    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c === '*') {
        isInsideAsterisk = !isInsideAsterisk;
        continue;
      }

      let col = defaultColor;
      let isHigh = false;

      // 1. Cor por caractere explicitamente personalizada
      if (hasCustomCharColors && charColors[cleanIdx] !== undefined) {
        col = charColors[cleanIdx];
        isHigh = String(col).toLowerCase() === String(highlightColor).toLowerCase();
      }
      // 2. Grifo via asteriscos no texto (*palavra*)
      else if (isInsideAsterisk) {
        col = highlightColor;
        isHigh = true;
      }
      // 3. Padrão do template (somente se usuário NÃO personalizou charColors e texto não foi alterado)
      else if (!hasCustomCharColors && layer && layer._def && layer._def.text === raw && layer._def.charColors && layer._def.charColors[cleanIdx] !== undefined) {
        col = layer._def.charColors[cleanIdx];
        isHigh = String(col).toLowerCase() === String(highlightColor).toLowerCase();
      }

      tokens.push({
        ch: c,
        index: cleanIdx,
        color: col,
        isHighlight: isHigh
      });
      cleanIdx++;
    }

    return tokens;
  }

  function getCharPaintAndGlow(ctx, l, tok, cw) {
    const col = tok.color || l.color || '#FFFFFF';
    const c2 = l.color2 || '#FFD166';
    const isC2 = tok.isHighlight || (String(col).toLowerCase() === String(c2).toLowerCase());

    if (isC2) {
      return {
        fill: paint(ctx, l, 'color2', -cw / 2, -55, cw / 2, 55),
        glow: 'rgba(255, 209, 102, 0.45)'
      };
    }

    if (l.color && String(col).toLowerCase() === String(l.color).toLowerCase()) {
      return {
        fill: paint(ctx, l, 'color', -cw / 2, -55, cw / 2, 55),
        glow: null
      };
    }

    // Cor hex personalizada (rosa #FF2E7E, ciano #22D3EE, esmeralda, etc.)
    let glow = null;
    const colUpper = String(col).toUpperCase();
    if (colUpper === '#FF2E7E' || colUpper.startsWith('#FF2E')) glow = 'rgba(255, 46, 126, 0.45)';
    else if (colUpper === '#22D3EE' || colUpper === '#06B6D4') glow = 'rgba(34, 211, 238, 0.45)';
    else if (colUpper === '#10B981' || colUpper === '#22C55E') glow = 'rgba(16, 185, 129, 0.45)';
    else if (colUpper === '#FFD166' || colUpper === '#FFE8A3') glow = 'rgba(255, 209, 102, 0.45)';

    const g = ctx.createLinearGradient(-cw / 2, -55, cw / 2, 55);
    g.addColorStop(0, mix(col, '#FFFFFF', 0.35));
    g.addColorStop(0.5, col);
    g.addColorStop(1, mix(col, '#000000', 0.25));
    return { fill: g, glow };
  }

  function layoutWords(ctx, tokens, fontStr, spaceW) {
    ctx.font = fontStr;
    const actualSpace = spaceW !== undefined ? spaceW : ctx.measureText(' ').width;
    let totalW = 0;
    const items = tokens.map(tok => {
      const w = ctx.measureText(tok.text).width;
      const it = { text: tok.text, highlight: tok.highlight, w: w, x: totalW };
      totalW += w + actualSpace;
      return it;
    });
    totalW = Math.max(0, totalW - actualSpace);
    items.forEach(it => {
      it.cx = it.x + it.w / 2 - totalW / 2;
    });
    return { items, totalW, spaceW: actualSpace };
  }

  /* ---------- Helpers de desenho ---------- */
  const E = { CW, CH, hits: [], SUITES, getDefs, resolve, elapsed, parseTextWithHighlights, parseCharTokens, cleanAsterisks, layoutWords, getCharPaintAndGlow };

  function mark(ctx, id, w, h) {
    const m = ctx.getTransform();
    const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
      .map(p => [m.a * p[0] + m.c * p[1] + m.e, m.b * p[0] + m.d * p[1] + m.f]);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    E.hits.push({ id, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
  }
  function layer(ctx, l, fn) {
    if (!l || !l.visible) return;
    ctx.save();
    ctx.translate(l.dx, l.dy);
    if (l.scale !== 1) ctx.scale(l.scale, l.scale);
    fn();
    ctx.restore();
  }
  function at(ctx, x, y, s, fn) {
    ctx.save(); ctx.translate(x, y); if (s !== 1) ctx.scale(s, s); fn(); ctx.restore();
  }
  const fontOf = (l, fb) => `${l.weight} ${l.size}px "${l.font}", ${fb || 'sans-serif'}`;
  function measure(ctx, l, str, fb) { ctx.font = fontOf(l, fb); return ctx.measureText(str).width; }

  // Desenha texto centrado na origem da camada. Retorna a largura.
  function drawTxt(ctx, l, str, o) {
    o = o || {};
    ctx.font = fontOf(l, o.fb);
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(str).width;
    ctx.fillStyle = o.fill || (o.grad ? paint(ctx, l, 'color', o.grad[0], o.grad[1], o.grad[2], o.grad[3]) : l.color);
    if (o.shadow) { ctx.shadowColor = o.shadow; ctx.shadowBlur = o.blur || 0; ctx.shadowOffsetY = o.oy || 0; }
    ctx.fillText(str, o.x || 0, o.dy || 0);
    mark(ctx, l.id, w + 10, l.size * 1.2);
    return w;
  }
  const hasText = l => l && l.visible && String(l.text || '') !== '';

  /* ---------- Renderizadores por categoria/modelo ---------- */
  const R = {};

  // ===== 1. HOOKS =====
  R.hook = function (ctx, sub, u, L, cfg, rawU) {
    if (sub === 'dilemma_clash') {
      const dur = cfg.duration || 3.4;
      // Saída suave e cinematográfica nos últimos 0.25s
      const out = P(rawU, Math.max(0.2, dur - 0.25), dur);
      const easeOut = out * out;
      if (1 - easeOut <= 0.001) return;
      ctx.globalAlpha = 1 - easeOut;
      ctx.scale(1 - 0.03 * easeOut, 1 - 0.03 * easeOut);

      // Easing editorial suave e sofisticado (sem repique de desenho animado)
      const smoothEnter = (t) => {
        if (t <= 0) return 0;
        return 1 - Math.exp(-7.5 * t) * Math.cos(8 * t);
      };
      const fadeZoom = (t, dur = 0.55) => {
        const p = clamp(t / dur);
        return 1 - Math.pow(1 - p, 3);
      };

      // 1. Quadro Editorial Noir (Elegante, proporção de revista de moda, r=16, filetes dourados)
      const pn = L.panel;
      if (pn && pn.visible) {
        const tPn = elapsed(u, pn);
        const ePn = smoothEnter(tPn);
        if (ePn > 0.001) at(ctx, 0, 0, ePn, () => layer(ctx, pn, () => {
          const W = pn.w, H = pn.h, Rr = 16;
          // Sombra profunda e difusa de luxo
          ctx.shadowColor = 'rgba(0, 0, 0, 0.85)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 20;
          ctx.fillStyle = paint(ctx, pn, 'fill', -W / 2, -H / 2, W / 2, H / 2);
          rr(ctx, -W / 2, -H / 2, W, H, Rr); ctx.fill();
          ctx.shadowColor = 'transparent';

          // Borda externa ultrafina (1.5px) com gradiente metálico
          ctx.strokeStyle = paint(ctx, pn, 'stroke', -W / 2, -H / 2, W / 2, H / 2);
          ctx.lineWidth = 1.5;
          rr(ctx, -W / 2, -H / 2, W, H, Rr); ctx.stroke();

          // Filetes internos decorativos de alta costura (hairline frame a 12px da borda)
          const inW = W - 28, inH = H - 28;
          ctx.strokeStyle = 'rgba(223, 200, 157, 0.18)';
          ctx.lineWidth = 0.75;
          rr(ctx, -inW / 2, -inH / 2, inW, inH, 10); ctx.stroke();

          // Micro-losangos de canto nos 4 vértices internos
          const crX = inW / 2 - 8, crY = inH / 2 - 8;
          ctx.fillStyle = '#D4AF37';
          [[-crX, -crY], [crX, -crY], [-crX, crY], [crX, crY]].forEach(([dx, dy]) => {
            ctx.beginPath();
            ctx.moveTo(dx, dy - 3); ctx.lineTo(dx + 3, dy); ctx.lineTo(dx, dy + 3); ctx.lineTo(dx - 3, dy);
            ctx.closePath(); ctx.fill();
          });

          mark(ctx, 'panel', W, H);
        }));
      }

      // 2. Linha 1: "V O C Ê   É" (Tracking amplo, elegância minimalista)
      const tL1 = elapsed(u, L.line1);
      const eL1 = fadeZoom(tL1, 0.55);
      if (hasText(L.line1) && eL1 > 0.01) {
        at(ctx, 0, -145 + (1 - eL1) * -12, 1, () => layer(ctx, L.line1, () => {
          ctx.globalAlpha = eL1;
          const str = String(L.line1.text || '');
          ctx.font = `${L.line1.weight || 600} ${L.line1.size}px "${L.line1.font}", sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = paint(ctx, L.line1, 'color', -200, 0, 200, 0);
          ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'; ctx.shadowBlur = 8;
          ctx.fillText(str, 0, 0);
          const tw = ctx.measureText(str).width;
          mark(ctx, 'line1', tw + 40, L.line1.size * 1.5);
        }));
      }

      // 3. Palavra Destaque Serifada: "— LASH —"
      const tHero = elapsed(u, L.hero_lash);
      const eHero = smoothEnter(tHero);
      if (hasText(L.hero_lash) && eHero > 0.01) {
        at(ctx, 0, -55, eHero, () => layer(ctx, L.hero_lash, () => {
          const hl = L.hero_lash;
          ctx.font = `${hl.weight || 700} ${hl.size}px "${hl.font}", serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const txt = String(hl.text || '');
          const tw = ctx.measureText(txt).width;

          // Filetes dourados laterais (— LASH —)
          const lineLen = 140, lineGap = 32;
          const leftLineX2 = -tw / 2 - lineGap, leftLineX1 = leftLineX2 - lineLen;
          const rightLineX1 = tw / 2 + lineGap, rightLineX2 = rightLineX1 + lineLen;

          const gLine = ctx.createLinearGradient(leftLineX1, 0, rightLineX2, 0);
          gLine.addColorStop(0, 'rgba(212, 175, 55, 0)');
          gLine.addColorStop(0.25, '#D4AF37');
          gLine.addColorStop(0.5, '#FFE8B5');
          gLine.addColorStop(0.75, '#D4AF37');
          gLine.addColorStop(1, 'rgba(212, 175, 55, 0)');
          ctx.strokeStyle = gLine;
          ctx.lineWidth = 1.5;

          // Desenha linhas laterais com expansão suave
          const pLine = clamp(tHero / 0.5);
          ctx.beginPath();
          ctx.moveTo(leftLineX2, 0); ctx.lineTo(leftLineX2 - lineLen * pLine, 0);
          ctx.moveTo(rightLineX1, 0); ctx.lineTo(rightLineX1 + lineLen * pLine, 0);
          ctx.stroke();

          // Micro-losangos nas pontas das linhas
          if (pLine > 0.8) {
            ctx.fillStyle = '#FFE8B5';
            [leftLineX2, rightLineX1].forEach(lx => {
              ctx.beginPath();
              ctx.moveTo(lx, -3); ctx.lineTo(lx + 3, 0); ctx.lineTo(lx, 3); ctx.lineTo(lx - 3, 0);
              ctx.closePath(); ctx.fill();
            });
          }

          // Texto LASH com brilho dourado metálico refinado
          ctx.fillStyle = paint(ctx, hl, 'color', -tw / 2, -40, tw / 2, 40);
          ctx.shadowColor = 'rgba(212, 175, 55, 0.45)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 2;
          ctx.fillText(txt, 0, 0);
          ctx.shadowColor = 'transparent';

          mark(ctx, 'hero_lash', tw + (lineLen + lineGap) * 2, hl.size * 1.3);
        }));
      }

      // 4. Ligatura Caligráfica Cursiva Chic: "ou só"
      const tScript = elapsed(u, L.script_connector);
      const eScript = fadeZoom(tScript, 0.6);
      if (hasText(L.script_connector) && eScript > 0.01) {
        at(ctx, 0, 22 + (1 - eScript) * 8, 1, () => layer(ctx, L.script_connector, () => {
          ctx.globalAlpha = eScript;
          const sc = L.script_connector;
          ctx.font = `${sc.weight || 400} ${sc.size}px "${sc.font}", cursive`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = paint(ctx, sc, 'color', -100, -20, 100, 20);
          ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 2;
          ctx.fillText(sc.text, 0, 0);
          ctx.shadowColor = 'transparent';
          mark(ctx, 'script_connector', ctx.measureText(sc.text).width + 30, sc.size * 1.2);
        }));
      }

      // 5. Linha Punch: "CULPA A COLA?" (Serifada clássica e imponente)
      const tPunch = elapsed(u, L.line_punch);
      const ePunch = smoothEnter(tPunch);
      if (hasText(L.line_punch) && ePunch > 0.01) {
        at(ctx, 0, 110, ePunch, () => layer(ctx, L.line_punch, () => {
          const lp = L.line_punch;
          const fullText = String(lp.text || '');
          const words = fullText.split(' ');
          const punchWord = words.length > 1 ? words.pop() : '';
          const baseText = words.join(' ') + (punchWord ? ' ' : '');

          ctx.font = `${lp.weight || 700} ${lp.size}px "${lp.font}", serif`;
          const mBase = ctx.measureText(baseText).width;
          const mPunch = ctx.measureText(punchWord).width;
          const totalW = mBase + mPunch;
          const startX = -totalW / 2;

          // Parte 1: "CULPA A " em Champanhe Seda puro
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = lp.color || '#FAF6EE';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.7)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 3;
          ctx.fillText(baseText, startX, 0);

          // Parte 2: "COLA?" em Ruby Chic profundo com halo dourado sofisticado
          if (punchWord) {
            ctx.shadowColor = rgba(lp.color2 || '#D81B60', 0.65); ctx.shadowBlur = 28; ctx.shadowOffsetY = 2;
            ctx.fillStyle = paint(ctx, lp, 'color2', startX + mBase, -30, startX + mBase + mPunch, 30);
            ctx.fillText(punchWord, startX + mBase, 0);
          }
          ctx.shadowColor = 'transparent';

          mark(ctx, 'line_punch', totalW, lp.size * 1.3);

          // Brilho de seda reflexivo (Satin Light Gleam suave)
          if (lp.sweep) {
            const sp = P(tPunch, 0.40, 1.25);
            if (sp > 0 && sp < 1) {
              const sx = startX - 50 + (totalW + 100) * sp;
              const lg = ctx.createLinearGradient(sx - 70, -40, sx + 70, 40);
              lg.addColorStop(0, 'rgba(255,255,255,0)');
              lg.addColorStop(0.5, 'rgba(255, 238, 200, 0.85)');
              lg.addColorStop(1, 'rgba(255,255,255,0)');
              ctx.fillStyle = lg;
              ctx.globalCompositeOperation = 'source-atop';
              ctx.fillText(fullText, startX, 0);
              ctx.globalCompositeOperation = 'source-over';
            }
          }
        }));
      }

      // 6. Filete Dourado Duplo Inferior (High-Fashion Underscore)
      if (L.double_rule && L.double_rule.visible) {
        const tRule = elapsed(u, L.double_rule);
        const pRule = clamp(tRule / 0.55);
        if (pRule > 0.01) at(ctx, 0, 185, 1, () => layer(ctx, L.double_rule, () => {
          const dr = L.double_rule, maxW = dr.w || 540, curW = maxW * (1 - Math.pow(1 - pRule, 3));
          const hw = curW / 2;

          const g = ctx.createLinearGradient(-hw, 0, hw, 0);
          g.addColorStop(0, 'rgba(212, 175, 55, 0)');
          g.addColorStop(0.3, '#D4AF37');
          g.addColorStop(0.5, '#FFE8B5');
          g.addColorStop(0.7, '#D4AF37');
          g.addColorStop(1, 'rgba(212, 175, 55, 0)');

          ctx.strokeStyle = g;
          // Linha 1 principal
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(-hw, -3); ctx.lineTo(hw, -3); ctx.stroke();
          // Linha 2 sutil
          ctx.lineWidth = 0.75;
          ctx.beginPath(); ctx.moveTo(-hw * 0.7, 3); ctx.lineTo(hw * 0.7, 3); ctx.stroke();

          mark(ctx, 'double_rule', maxW, 16);
        }));
      }
      return;
    }

    if (sub === 'frameless_kinetic') {
      const dur = cfg.duration || 3.4;
      const out = P(rawU, Math.max(0.2, dur - 0.24), dur);
      const easeOut = out * out * out;
      if (1 - easeOut <= 0.001) return;
      ctx.globalAlpha = 1 - easeOut;
      ctx.scale(1 - 0.04 * easeOut, 1 - 0.04 * easeOut);

      const easeQuart = (t, d = 0.48) => {
        if (t <= 0) return 0;
        const p = clamp(t / d);
        return 1 - Math.pow(1 - p, 4);
      };
      const easeExpo = (t, d = 0.54) => {
        if (t <= 0) return 0;
        const p = clamp(t / d);
        return p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
      };

      // Helper de Tipografia Flutuante 100% Sem Caixa (Sombra tripla conformada exatamente às letras, sem mancha oval e sem corte de clip)
      const drawCleanLuxuryText = (str, x, y, fillStyle, glowCol) => {
        ctx.save();
        // Passo 1: Sombra difusa de leitura (segue apenas o formato da letra)
        ctx.shadowColor = 'rgba(0, 0, 0, 0.90)';
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 6;
        ctx.fillStyle = fillStyle;
        ctx.fillText(str, x, y);

        // Passo 2: Sombra média de densidade óptica
        ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
        ctx.shadowBlur = 9;
        ctx.shadowOffsetY = 3;
        ctx.fillText(str, x, y);

        // Passo 3: Sombra curta de recorte + glow dourado opcional
        ctx.shadowColor = glowCol || 'rgba(0, 0, 0, 0.75)';
        ctx.shadowBlur = glowCol ? 18 : 3;
        ctx.shadowOffsetY = glowCol ? 0 : 1;
        ctx.fillText(str, x, y);
        ctx.restore();
      };

      // 1. Linha 1: Palavra por Palavra com Optical Blur + Subida Fluida ("VOCÊ SABE TRABALHAR", y = -58)
      const l1 = L.line1;
      if (hasText(l1)) {
        const tBase = elapsed(u, l1);
        if (tBase > 0) {
          at(ctx, 0, -58, 1, () => layer(ctx, l1, () => {
            const fullStr = String(l1.text || '').trim();
            const words = fullStr.split(/\s+/);
            ctx.font = `${l1.weight || 800} ${l1.size}px "${l1.font}", "MADE TOMMY", Montserrat, sans-serif`;
            ctx.textBaseline = 'middle';
            const spaceW = ctx.measureText(' ').width * 1.14;
            const wordWidths = words.map(w => ctx.measureText(w).width);
            const totalW = wordWidths.reduce((a, b) => a + b, 0) + spaceW * Math.max(0, words.length - 1);

            let curX = -totalW / 2;

            words.forEach((word, idx) => {
              const wW = wordWidths[idx];
              const wt = tBase - idx * 0.11;
              if (wt > 0) {
                const wp = easeExpo(wt, 0.48);
                const blurPx = Math.max(0, (1 - wp) * 12);
                const dy = (1 - wp) * 28;
                const sc = 0.94 + 0.06 * wp;

                ctx.save();
                ctx.translate(curX + wW / 2, dy);
                ctx.scale(sc, sc);
                ctx.globalAlpha = clamp(wt / 0.20);
                if (blurPx > 0.25) ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
                ctx.textAlign = 'center';

                const fillG = paint(ctx, l1, 'color', -wW / 2, -26, wW / 2, 26);
                drawCleanLuxuryText(word, 0, 0, fillG, null);
                ctx.restore();
              }
              curX += wW + spaceW;
            });

            mark(ctx, 'line1', totalW + 30, l1.size * 1.5);
          }));
        }
      }

      // Medição da Linha 2 ("com o" + "FIO Y?")
      const pr = L.prefix;
      const hr = L.hero;

      ctx.font = `italic ${(pr && pr.weight) || 600} ${(pr && pr.size) || 80}px "${(pr && pr.font) || 'Playfair Display'}", Georgia, serif`;
      const wPrefix = hasText(pr) ? ctx.measureText(String(pr.text)).width : 0;

      ctx.font = `${(hr && hr.weight) || 900} ${(hr && hr.size) || 122}px "${(hr && hr.font) || 'SF Pro Display'}", "MADE TOMMY", Montserrat, sans-serif`;
      const strHero = hasText(hr) ? String(hr.text) : '';
      const heroTokens = parseCharTokens(strHero, hr);
      const charWidths = heroTokens.map(tok => ctx.measureText(tok.ch).width);
      const wHero = charWidths.reduce((a, b) => a + b, 0);

      const gap2 = (wPrefix > 0 && wHero > 0) ? 30 : 0;
      const totalRow2W = wPrefix + gap2 + wHero;
      const row2Left = -totalRow2W / 2;
      const prefixCenterX = row2Left + wPrefix / 2;
      const heroStartX = row2Left + wPrefix + gap2;
      const heroCenterX = heroStartX + wHero / 2;

      // 2A. Conector Itálico Editorial ("com o") com Foco Óptico Suave
      if (hasText(pr)) {
        const tPr = elapsed(u, pr);
        const ePr = easeExpo(tPr, 0.52);
        if (ePr > 0.005) {
          at(ctx, prefixCenterX, 34, 1, () => layer(ctx, pr, () => {
            const blurPx = Math.max(0, (1 - ePr) * 11);
            const dx = (1 - ePr) * -22;
            const dy = (1 - ePr) * 14;
            ctx.save();
            ctx.translate(dx, dy);
            ctx.globalAlpha = clamp(tPr / 0.22);
            if (blurPx > 0.25) ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
            ctx.font = `italic ${pr.weight || 600} ${pr.size}px "${pr.font}", Georgia, serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const fillPr = paint(ctx, pr, 'color', -wPrefix / 2, -25, wPrefix / 2, 25);
            drawCleanLuxuryText(pr.text, 0, 0, fillPr, 'rgba(232, 209, 167, 0.25)');
            ctx.restore();
            mark(ctx, 'prefix', wPrefix + 24, pr.size * 1.3);
          }));
        }
      }

      // 2B. Destaque Monumental Letra por Letra ("FIO Y?") com Optical Blur (Sem Clip-Box Cortando Sombra)
      if (hasText(hr)) {
        const tHr = elapsed(u, hr);
        if (tHr > 0) {
          at(ctx, heroCenterX, 38, 1, () => layer(ctx, hr, () => {
            ctx.font = `${hr.weight || 900} ${hr.size}px "${hr.font}", "MADE TOMMY", Montserrat, sans-serif`;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';

            let cx = -wHero / 2;

            heroTokens.forEach((tok, idx) => {
              const ch = tok.ch;
              const cw = charWidths[idx];
              const ct = tHr - idx * 0.055;
              if (ch !== ' ' && ct > 0) {
                const cp = easeExpo(ct, 0.48);
                const blurPx = Math.max(0, (1 - cp) * 12);
                const dy = (1 - cp) * 34;
                const sc = 0.88 + 0.12 * cp;

                ctx.save();
                ctx.translate(cx + cw / 2, dy);
                ctx.scale(sc, sc);
                ctx.globalAlpha = clamp(ct / 0.18);
                if (blurPx > 0.25) ctx.filter = `blur(${blurPx.toFixed(1)}px)`;

                const { fill: fillCh, glow: glowCh } = getCharPaintAndGlow(ctx, hr, tok, cw);

                drawCleanLuxuryText(ch, 0, 0, fillCh, glowCh);
                ctx.restore();
              }
              cx += cw;
            });

            // Varredura Especular Diagonal (Light Gleam)
            if (hr.sweep) {
              const sp = P(tHr, 0.46, 1.28);
              if (sp > 0 && sp < 1) {
                ctx.save();
                let mCx = -wHero / 2;
                const sweepX = -wHero / 2 - 70 + (wHero + 140) * sp;
                heroTokens.forEach((tok, idx) => {
                  const cw = charWidths[idx];
                  if (tok.ch !== ' ' && (tHr - idx * 0.055) > 0.22) {
                    const chCenter = mCx + cw / 2;
                    if (Math.abs(chCenter - sweepX) < 90) {
                      ctx.globalAlpha = clamp(1 - Math.abs(chCenter - sweepX) / 90) * 0.72;
                      ctx.fillStyle = '#FFFFFF';
                      ctx.fillText(tok.ch, chCenter, 0);
                    }
                  }
                  mCx += cw;
                });
                ctx.restore();
              }
            }

            mark(ctx, 'hero', wHero + 30, hr.size * 1.25);
          }));
        }
      }

      // 3. Filete Luminoso Curvo Minimalista sob "FIO Y?" (Sem contorno escuro pesado)
      const sw = L.swash;
      if (sw && sw.visible) {
        const tSw = elapsed(u, sw);
        const pSw = easeQuart(tSw, 0.54);
        if (pSw > 0.01) {
          at(ctx, heroCenterX, 102, 1, () => layer(ctx, sw, () => {
            const fullW = Math.max(sw.w || 380, wHero * 0.94);
            const x0 = -fullW / 2;
            const x1 = x0 + fullW * pSw;
            const xm = x0 + (x1 - x0) * 0.52;

            ctx.save();
            ctx.shadowColor = 'rgba(255, 209, 102, 0.75)';
            ctx.shadowBlur = 14;
            ctx.shadowOffsetY = 0;

            const gSw = ctx.createLinearGradient(x0, 0, x0 + fullW, 0);
            gSw.addColorStop(0, 'rgba(212, 175, 55, 0)');
            gSw.addColorStop(0.25, sw.stroke || '#FFD166');
            gSw.addColorStop(0.75, '#FFF6D6');
            gSw.addColorStop(1, '#FFFFFF');

            // Fita afilada fina e elegante
            ctx.beginPath();
            ctx.moveTo(x0, 2);
            ctx.quadraticCurveTo(xm, -6, x1, -1);
            ctx.quadraticCurveTo(xm, -2, x0, 2);
            ctx.closePath();
            ctx.fillStyle = gSw;
            ctx.fill();

            // Micro-estrela diamantina sutil na ponta
            if (pSw > 0.15 && pSw < 0.98) {
              const sr = 9 * Math.sin(pSw * Math.PI);
              ctx.translate(x1, -1);
              ctx.fillStyle = '#FFFFFF';
              ctx.beginPath();
              ctx.moveTo(0, -sr);
              ctx.quadraticCurveTo(1.2, -1.2, sr, 0);
              ctx.quadraticCurveTo(1.2, 1.2, 0, sr);
              ctx.quadraticCurveTo(-1.2, 1.2, -sr, 0);
              ctx.quadraticCurveTo(-1.2, -1.2, 0, -sr);
              ctx.closePath();
              ctx.fill();
            }

            ctx.restore();
            mark(ctx, 'swash', fullW + 24, 24);
          }));
        }
      }

      return;
    }

    if (sub === 'horizon_split_hero') {
      const dur = cfg.duration || 3.4;
      const out = P(rawU, Math.max(0.2, dur - 0.24), dur);
      const easeOut = out * out * out;
      if (1 - easeOut <= 0.001) return;
      ctx.globalAlpha = 1 - easeOut;
      ctx.scale(1 - 0.04 * easeOut, 1 - 0.04 * easeOut);

      const easeExpo = (t, d = 0.54) => {
        if (t <= 0) return 0;
        const p = clamp(t / d);
        return p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
      };

      const horizonY = -36;

      // Medições prévias para dimensionamento automático dos cartões
      const l1 = L.line1;
      const str1 = String((l1 && l1.text) || '').trim();
      ctx.font = `${(l1 && l1.weight) || 800} ${(l1 && l1.size) || 38}px "${(l1 && l1.font) || 'SF Pro Display'}", "MADE TOMMY", Montserrat, sans-serif`;
      const wLine1 = str1 ? ctx.measureText(str1).width : 480;

      const hr = L.hero;
      const strHero = String((hr && hr.text) || '').trim();
      ctx.font = `${(hr && hr.weight) || 900} ${(hr && hr.size) || 138}px "${(hr && hr.font) || 'SF Pro Display'}", "MADE TOMMY", Montserrat, sans-serif`;
      const wHeroTotal = strHero ? ctx.measureText(strHero).width : 420;

      // 1. Parte Superior (Emerge PARA CIMA a partir da Linha Horizonte em y = -36)
      const tb = L.top_badge;
      const tTop = elapsed(u, l1 || tb);
      const eTop = easeExpo(tTop, 0.52);
      if (eTop > 0.005) {
        ctx.save();
        // Máscara de corte superior (tudo abaixo de horizonY fica invisível)
        ctx.beginPath();
        ctx.rect(-800, -360, 1600, 360 + horizonY);
        ctx.clip();

        const curTopY = -92 + (1 - eTop) * 104;

        if (tb && tb.visible) {
          at(ctx, 0, curTopY, 1, () => layer(ctx, tb, () => {
            const bW = Math.max(540, wLine1 + 76);
            const bH = tb.h || 72;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.78)';
            ctx.shadowBlur = 32;
            ctx.shadowOffsetY = 8;
            ctx.fillStyle = paint(ctx, tb, 'fill', -bW / 2, -bH / 2, bW / 2, bH / 2);
            rr(ctx, -bW / 2, -bH / 2, bW, bH, 20);
            ctx.fill();
            ctx.shadowColor = 'transparent';

            ctx.strokeStyle = paint(ctx, tb, 'stroke', -bW / 2, -bH / 2, bW / 2, bH / 2);
            ctx.lineWidth = 1.4;
            rr(ctx, -bW / 2, -bH / 2, bW, bH, 20);
            ctx.stroke();
            mark(ctx, 'top_badge', bW, bH);
          }));
        }

        if (hasText(l1)) {
          at(ctx, 0, curTopY, 1, () => layer(ctx, l1, () => {
            ctx.font = `${l1.weight || 800} ${l1.size}px "${l1.font}", "MADE TOMMY", Montserrat, sans-serif`;
            ctx.textBaseline = 'middle';

            // Separa conector final ("COM O" ou última palavra) em ouro champanhe
            const mConn = str1.match(/^(.*?)\s+(COM\s+O|COM\s+A|NO|NA|DO|DA|\S+)$/i);
            const mainPart = mConn ? mConn[1] + ' ' : str1;
            const accentPart = mConn ? mConn[2] : '';

            const wMain = ctx.measureText(mainPart).width;
            const wAcc = accentPart ? ctx.measureText(accentPart).width : 0;
            const totalW = wMain + wAcc;
            const sx = -totalW / 2;

            ctx.textAlign = 'left';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetY = 2;
            ctx.fillStyle = l1.color || '#FAF6EE';
            ctx.fillText(mainPart, sx, 1);

            if (accentPart) {
              ctx.fillStyle = l1.color2 || '#FFD166';
              ctx.fillText(accentPart, sx + wMain, 1);
            }
            ctx.shadowColor = 'transparent';
            mark(ctx, 'line1', totalW + 24, l1.size * 1.4);
          }));
        }

        ctx.restore();
      }

      // 2. Parte Inferior Monumental (Emerge PARA BAIXO a partir da Linha Horizonte em y = -36)
      const bd = L.backdrop;
      const tBot = elapsed(u, hr || bd);
      const eBot = easeExpo(tBot, 0.58);
      if (eBot > 0.005) {
        ctx.save();
        // Máscara de corte inferior (tudo acima de horizonY fica invisível)
        ctx.beginPath();
        ctx.rect(-800, horizonY, 1600, 460);
        ctx.clip();

        const curBotY = 66 - (1 - eBot) * 195;

        if (bd && bd.visible) {
          at(ctx, 0, curBotY, 1, () => layer(ctx, bd, () => {
            const W = Math.max(bd.w || 680, wHeroTotal + 120);
            const H = bd.h || 176;
            const Rr = 32;

            ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
            ctx.shadowBlur = 55;
            ctx.shadowOffsetY = 18;
            ctx.fillStyle = paint(ctx, bd, 'fill', -W / 2, -H / 2, W / 2, H / 2);
            rr(ctx, -W / 2, -H / 2, W, H, Rr);
            ctx.fill();
            ctx.shadowColor = 'transparent';

            // Halo dourado radial atrás do "Y?"
            ctx.save();
            rr(ctx, -W / 2, -H / 2, W, H, Rr);
            ctx.clip();
            const rg = ctx.createRadialGradient(W * 0.16, 0, 10, W * 0.16, 0, W * 0.45);
            rg.addColorStop(0, 'rgba(255, 209, 102, 0.22)');
            rg.addColorStop(1, 'rgba(255, 209, 102, 0)');
            ctx.fillStyle = rg;
            ctx.fillRect(-W / 2, -H / 2, W, H);
            ctx.restore();

            ctx.strokeStyle = paint(ctx, bd, 'stroke', -W / 2, -H / 2, W / 2, H / 2);
            ctx.lineWidth = 1.6;
            rr(ctx, -W / 2, -H / 2, W, H, Rr);
            ctx.stroke();

            mark(ctx, 'backdrop', W, H);
          }));
        }

        if (hasText(hr)) {
          at(ctx, 0, curBotY, 1, () => layer(ctx, hr, () => {
            const blurPx = Math.max(0, (1 - eBot) * 10);
            ctx.save();
            if (blurPx > 0.25) ctx.filter = `blur(${blurPx.toFixed(1)}px)`;

            ctx.font = `${hr.weight || 900} ${hr.size}px "${hr.font}", "MADE TOMMY", Montserrat, sans-serif`;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';

            const heroTokens = parseCharTokens(strHero, hr);
            const charWidths = heroTokens.map(tok => ctx.measureText(tok.ch).width);
            const totalW = charWidths.reduce((a, b) => a + b, 0);
            const sx = -totalW / 2;

            let curX = sx;
            heroTokens.forEach((tok, idx) => {
              const ch = tok.ch;
              const cw = charWidths[idx];
              if (ch !== ' ') {
                const { fill: fillCh, glow: glowCh } = getCharPaintAndGlow(ctx, hr, tok, cw);
                ctx.shadowColor = glowCh || 'rgba(0, 0, 0, 0.85)';
                ctx.shadowBlur = glowCh ? 32 : 22;
                ctx.shadowOffsetY = glowCh ? 4 : 6;
                ctx.fillStyle = fillCh;
                ctx.fillText(ch, curX, 4);
              }
              curX += cw;
            });
            ctx.shadowColor = 'transparent';

            // Varredura Especular Diagonal (Light Gleam) sobre o Hero
            if (hr.sweep) {
              const sp = P(tBot, 0.35, 1.18);
              if (sp > 0 && sp < 1) {
                const sweepX = sx - 80 + (totalW + 160) * sp;
                const lg = ctx.createLinearGradient(sweepX - 65, -60, sweepX + 65, 60);
                lg.addColorStop(0, 'rgba(255, 255, 255, 0)');
                lg.addColorStop(0.5, 'rgba(255, 255, 255, 0.92)');
                lg.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = lg;
                ctx.globalCompositeOperation = 'source-atop';
                let curGx = sx;
                heroTokens.forEach((tok, idx) => {
                  const cw = charWidths[idx];
                  if (tok.ch !== ' ') ctx.fillText(tok.ch, curGx, 4);
                  curGx += cw;
                });
                ctx.globalCompositeOperation = 'source-over';
              }
            }

            ctx.restore();
            mark(ctx, 'hero', totalW + 30, hr.size * 1.15);
          }));
        }

        ctx.restore();
      }

      // 3. Linha Horizonte Laser Dourada (Cortina Divisória Central em y = -36)
      const dv = L.divider;
      if (dv && dv.visible) {
        const tDv = elapsed(u, dv);
        const eDv = easeExpo(tDv, 0.44);
        if (eDv > 0.005) {
          at(ctx, 0, horizonY, 1, () => layer(ctx, dv, () => {
            const maxW = Math.max(dv.w || 780, wHeroTotal + 180);
            const hw = (maxW * eDv) / 2;

            const g = ctx.createLinearGradient(-hw, 0, hw, 0);
            g.addColorStop(0, 'rgba(212, 175, 55, 0)');
            g.addColorStop(0.18, dv.stroke || '#D4AF37');
            g.addColorStop(0.5, '#FFF8E1');
            g.addColorStop(0.82, dv.stroke || '#D4AF37');
            g.addColorStop(1, 'rgba(212, 175, 55, 0)');

            ctx.save();
            ctx.shadowColor = 'rgba(255, 215, 110, 0.85)';
            ctx.shadowBlur = 16;
            ctx.strokeStyle = g;
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            ctx.moveTo(-hw, 0);
            ctx.lineTo(hw, 0);
            ctx.stroke();

            // Losangos de luz nas pontas durante a abertura e no centro
            ctx.fillStyle = '#FFF8E1';
            ctx.beginPath();
            ctx.moveTo(0, -4.5); ctx.lineTo(6, 0); ctx.moveTo(0, 4.5); ctx.lineTo(-6, 0);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            mark(ctx, 'divider', maxW, 18);
          }));
        }
      }

      return;
    }

    if (sub === 'y_lash_precision') {
      const dur = cfg.duration || 3.4;
      // Saída suave nos últimos 0.24s
      const out = P(rawU, Math.max(0.2, dur - 0.24), dur);
      const easeOut = out * out * out;
      if (1 - easeOut <= 0.001) return;
      ctx.globalAlpha = 1 - easeOut;
      ctx.scale(1 - 0.04 * easeOut, 1 - 0.04 * easeOut);

      // Curva Apple / Devin Jatho (Quartic / Exponential Snap sem bounce cartoon)
      const easeQuart = (t, d = 0.48) => {
        if (t <= 0) return 0;
        const p = clamp(t / d);
        return 1 - Math.pow(1 - p, 4);
      };
      const easeExpo = (t, d = 0.56) => {
        if (t <= 0) return 0;
        const p = clamp(t / d);
        return p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
      };

      // 1. Barra Glass Noir Compacta (Fundo de alto contraste com brilho interno sutil)
      const pn = L.panel;
      if (pn && pn.visible) {
        const tPn = elapsed(u, pn);
        const ePn = easeExpo(tPn, 0.50);
        if (ePn > 0.002) at(ctx, 0, 0, 0.92 + 0.08 * ePn, () => layer(ctx, pn, () => {
          ctx.globalAlpha = clamp(tPn / 0.22);
          const W = pn.w || 960, H = pn.h || 256, Rr = 38;

          // Sombra de cinema profunda
          ctx.shadowColor = 'rgba(0, 0, 0, 0.82)';
          ctx.shadowBlur = 52;
          ctx.shadowOffsetY = 18;
          ctx.fillStyle = paint(ctx, pn, 'fill', -W / 2, -H / 2, W / 2, H / 2);
          rr(ctx, -W / 2, -H / 2, W, H, Rr);
          ctx.fill();
          ctx.shadowColor = 'transparent';

          // Halo interno quente à direita (onde a cápsula FIO Y? se abre)
          ctx.save();
          rr(ctx, -W / 2, -H / 2, W, H, Rr);
          ctx.clip();
          const rg = ctx.createRadialGradient(W * 0.14, 38, 10, W * 0.14, 38, W * 0.45);
          rg.addColorStop(0, 'rgba(212, 175, 55, 0.16)');
          rg.addColorStop(1, 'rgba(212, 175, 55, 0)');
          ctx.fillStyle = rg;
          ctx.fillRect(-W / 2, -H / 2, W, H);
          ctx.restore();

          // Borda especular de vidro (1.5px)
          ctx.strokeStyle = paint(ctx, pn, 'stroke', -W / 2, -H / 2, W / 2, H / 2);
          ctx.lineWidth = 1.5;
          rr(ctx, -W / 2, -H / 2, W, H, Rr);
          ctx.stroke();

          mark(ctx, 'panel', W, H);
        }));
      }

      // 2. Linha 1: Revelação Palavra por Palavra com Optical Blur + Mask Slide ("VOCÊ SABE TRABALHAR")
      const l1 = L.line1;
      if (hasText(l1)) {
        const tBase = elapsed(u, l1);
        if (tBase > 0) {
          at(ctx, 0, -48, 1, () => layer(ctx, l1, () => {
            const fullStr = String(l1.text || '').trim();
            const words = fullStr.split(/\s+/);
            ctx.font = `${l1.weight || 800} ${l1.size}px "${l1.font}", "MADE TOMMY", Montserrat, sans-serif`;
            ctx.textBaseline = 'middle';
            const spaceW = ctx.measureText(' ').width * 1.12;
            const wordWidths = words.map(w => ctx.measureText(w).width);
            const totalW = wordWidths.reduce((a, b) => a + b, 0) + spaceW * Math.max(0, words.length - 1);

            let curX = -totalW / 2;
            const maskH = l1.size * 1.45;

            words.forEach((word, idx) => {
              const wW = wordWidths[idx];
              const wt = tBase - idx * 0.11;
              if (wt > 0) {
                const wp = easeQuart(wt, 0.44);
                const blurPx = Math.max(0, (1 - wp) * 11);
                const slideY = (1 - wp) * 34;

                ctx.save();
                // Máscara horizontal invisível por palavra (Mask Slide Reveal)
                ctx.beginPath();
                ctx.rect(curX - 14, -maskH / 2, wW + 28, maskH);
                ctx.clip();

                ctx.globalAlpha = clamp(wt / 0.20);
                if (blurPx > 0.25) ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
                ctx.textAlign = 'left';
                ctx.fillStyle = paint(ctx, l1, 'color', -totalW / 2, -25, totalW / 2, 25);
                ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
                ctx.shadowBlur = 14;
                ctx.shadowOffsetY = 3;
                ctx.fillText(word, curX, slideY);
                ctx.restore();
              }
              curX += wW + spaceW;
            });

            mark(ctx, 'line1', totalW + 24, maskH);
          }));
        }
      }

      // 3. Linha 2: Auto-Layout Cinético ("com o" empurrado pela abertura da cápsula "[ FIO Y? ]")
      const pr = L.prefix;
      const pl = L.pill;
      const hr = L.hero;

      const tPr = elapsed(u, pr);
      const tPl = elapsed(u, pl);
      const tHr = elapsed(u, hr);

      const ePr = easeQuart(tPr, 0.45);
      const unfoldP = (pl && pl.visible) ? easeExpo(tPl, 0.56) : (hasText(hr) ? easeExpo(tHr, 0.56) : 0);

      // Medição precisa para o Kinetic Push
      ctx.font = `italic ${pr ? (pr.weight || 600) : 600} ${pr ? pr.size : 56}px "${pr ? pr.font : 'Playfair Display'}", Georgia, serif`;
      const wPrefix = hasText(pr) ? ctx.measureText(String(pr.text)).width : 0;

      ctx.font = `${hr ? (hr.weight || 900) : 900} ${hr ? hr.size : 62}px "${hr ? hr.font : 'SF Pro Display'}", "MADE TOMMY", Montserrat, sans-serif`;
      const wHero = hasText(hr) ? ctx.measureText(String(hr.text)).width : 0;

      const fullPillW = wHero > 0 ? wHero + 68 : 260;
      const pillH = (pl && pl.h) ? pl.h : 84;
      const curPillW = fullPillW * unfoldP;
      const gap = (wPrefix > 0 && curPillW > 1) ? 24 * unfoldP : 0;

      const totalRow2W = wPrefix + gap + curPillW;
      const row2Left = -totalRow2W / 2;
      const prefixCenterX = row2Left + wPrefix / 2;
      const pillCenterX = row2Left + wPrefix + gap + curPillW / 2;

      // 3A. Desenha o conector "com o" deslizando para a esquerda em equilíbrio óptico
      if (hasText(pr) && ePr > 0.005) {
        at(ctx, prefixCenterX, 44, 1, () => layer(ctx, pr, () => {
          const blurPr = Math.max(0, (1 - ePr) * 10);
          const dyPr = (1 - ePr) * 20;
          ctx.save();
          ctx.globalAlpha = clamp(tPr / 0.22);
          if (blurPr > 0.25) ctx.filter = `blur(${blurPr.toFixed(1)}px)`;
          ctx.font = `italic ${pr.weight || 600} ${pr.size}px "${pr.font}", Georgia, serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = paint(ctx, pr, 'color', -wPrefix / 2, -20, wPrefix / 2, 20);
          ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
          ctx.shadowBlur = 12;
          ctx.shadowOffsetY = 2;
          ctx.fillText(pr.text, 0, dyPr);
          ctx.restore();
          mark(ctx, 'prefix', wPrefix + 20, pr.size * 1.2);
        }));
      }

      // 3B. Desenha a Cápsula Dourada Expansiva + Texto Knockout "FIO Y?" com Clip Mask
      if (unfoldP > 0.008) {
        if (pl && pl.visible) {
          at(ctx, pillCenterX, 44, 1, () => layer(ctx, pl, () => {
            const r = Math.min(pillH / 2, curPillW / 2);
            ctx.save();
            ctx.shadowColor = 'rgba(212, 175, 55, 0.42)';
            ctx.shadowBlur = 32;
            ctx.shadowOffsetY = 6;
            ctx.fillStyle = paint(ctx, pl, 'fill', -fullPillW / 2, -pillH / 2, fullPillW / 2, pillH / 2);
            rr(ctx, -curPillW / 2, -pillH / 2, curPillW, pillH, r);
            ctx.fill();
            ctx.restore();

            ctx.strokeStyle = pl.stroke || '#FFFDF7';
            ctx.lineWidth = 2.0;
            rr(ctx, -curPillW / 2, -pillH / 2, curPillW, pillH, r);
            ctx.stroke();

            mark(ctx, 'pill', Math.max(curPillW, 40), pillH);
          }));
        }

        if (hasText(hr)) {
          at(ctx, pillCenterX, 44, 1, () => layer(ctx, hr, () => {
            const r = Math.min(pillH / 2, curPillW / 2);
            ctx.save();
            // Recorta o texto estritamente dentro da cápsula em expansão (Unfold Reveal)
            rr(ctx, -curPillW / 2, -pillH / 2, curPillW, pillH, r);
            ctx.clip();

            const blurHr = Math.max(0, (1 - unfoldP) * 8);
            if (blurHr > 0.25) ctx.filter = `blur(${blurHr.toFixed(1)}px)`;

            ctx.font = `${hr.weight || 900} ${hr.size}px "${hr.font}", "MADE TOMMY", Montserrat, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = hr.color || '#14060C';
            // Leve contra-deslizamento interno enquanto a cápsula se abre
            const slideX = (1 - unfoldP) * 24;
            ctx.fillText(hr.text, slideX, 2);

            // Feixe Especular Diagonal (Light Gleam) sobre a cápsula e o texto
            if (hr.sweep) {
              const sp = P(tHr, 0.32, 1.15);
              if (sp > 0 && sp < 1) {
                const sx = -fullPillW / 2 - 70 + (fullPillW + 140) * sp;
                const lg = ctx.createLinearGradient(sx - 55, -pillH / 2, sx + 55, pillH / 2);
                lg.addColorStop(0, 'rgba(255, 255, 255, 0)');
                lg.addColorStop(0.5, 'rgba(255, 255, 255, 0.78)');
                lg.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = lg;
                ctx.fillRect(-curPillW / 2, -pillH / 2, curPillW, pillH);
              }
            }

            ctx.restore();
            mark(ctx, 'hero', Math.max(wHero, 60), pillH);
          }));
        }
      }

      return;
    }

    const wide = sub === 'widescreen';
    const dur = cfg.duration || 2.95;
    // A saída ocorre nos últimos 0.22s da duração real do clipe
    const out = backIn(P(rawU, Math.max(0.2, dur - 0.22), dur), 2.0);
    if (1 - out <= 0.001) return;
    ctx.scale(1 - out, 1 - out);

    const pn = L.panel;
    const ePanel = spring(elapsed(u, pn), 14, 6.5);
    if (ePanel > 0.001) at(ctx, 0, 0, ePanel, () => layer(ctx, pn, () => {
      const W = pn.w, H = pn.h, Rr = 44;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.65)'; ctx.shadowBlur = 45; ctx.shadowOffsetY = 16;
      ctx.fillStyle = paint(ctx, pn, 'fill', -W / 2, -H / 2, W / 2, H / 2);
      rr(ctx, -W / 2, -H / 2, W, H, Rr); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = paint(ctx, pn, 'stroke', -W / 2, -H / 2, W / 2, H / 2); ctx.lineWidth = 3.5;
      rr(ctx, -W / 2, -H / 2, W, H, Rr); ctx.stroke();
      mark(ctx, 'panel', W, H);
    }));

    if (wide && L.divider) {
      const eDiv = spring(elapsed(u, L.divider), 14, 7);
      if (eDiv > 0.01) at(ctx, 0, 0, eDiv, () => layer(ctx, L.divider, () => {
        const dv = L.divider, hw = dv.w / 2;
        const g = ctx.createLinearGradient(-hw, 0, hw, 0);
        g.addColorStop(0, rgba(dv.stroke, 0)); g.addColorStop(0.5, rgba(dv.stroke, 0.25)); g.addColorStop(1, rgba(dv.stroke, 0));
        ctx.strokeStyle = g; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-hw, 0); ctx.lineTo(hw, 0); ctx.stroke();
        mark(ctx, 'divider', dv.w, 24);
      }));
    }

    const eL1 = spring(elapsed(u, L.line1), 16, 7.5);
    const eL2 = L.line2 ? spring(elapsed(u, L.line2), 16, 7.5) : 0;
    const tHero = elapsed(u, L.hero);
    const eHero = spring(tHero, 15, 6.2);
    const eL4 = L.line4 ? spring(elapsed(u, L.line4), 15, 6.8) : 0;

    if (hasText(L.line1) && eL1 > 0.01) at(ctx, 0, wide ? -62 : -135, eL1, () => layer(ctx, L.line1, () =>
      drawTxt(ctx, L.line1, L.line1.text, { shadow: 'rgba(255,255,255,0.25)', blur: 14, oy: 2 })));

    if (!wide && hasText(L.line2) && eL2 > 0.01) at(ctx, 0, -70, eL2, () => layer(ctx, L.line2, () =>
      drawTxt(ctx, L.line2, L.line2.text)));

    if (hasText(L.hero) && eHero > 0.01) at(ctx, 0, wide ? 64 : 6, eHero, () => layer(ctx, L.hero, () => {
      const h = L.hero;
      drawTxt(ctx, h, h.text, { grad: [-300, 0, 300, 0], shadow: rgba(h.color, 0.65), blur: 35, oy: 2 });
      if (h.sweep) {
        const sp = P(tHero, 0.20, 0.75);
        if (sp > 0 && sp < 1) {
          const w = 600, sx = -w / 2 - 40 + (w + 80) * sp;
          const lg = ctx.createLinearGradient(sx - 50, -40, sx + 50, 40);
          lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.9)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = lg; ctx.globalCompositeOperation = 'source-atop';
          ctx.shadowColor = 'transparent';
          ctx.fillText(h.text, 0, 0);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    }));

    if (!wide && hasText(L.line4) && eL4 > 0.01) at(ctx, 0, 102, eL4, () => layer(ctx, L.line4, () =>
      drawTxt(ctx, L.line4, L.line4.text, { grad: [-280, 0, 280, 0], shadow: rgba(L.line4.color, 0.65), blur: 28, oy: 2 })));
  };

  // ===== 2. HAUTE COUTURE =====
  R.haute = function (ctx, sub, u, L) {
    const serifTxt = String(L.serif.text || '').toUpperCase();
    const sc = L.script;

    if (sub === '05b') {
      const t1 = elapsed(u, L.serif);
      const t2 = elapsed(u, sc);
      if (serifTxt && L.serif.visible && t1 > 0) {
        const fp1 = clamp(t1 / 0.7), blur1 = Math.max(0, (1 - fp1) * 16);
        const alpha1 = clamp(t1 / 0.45), zoom1 = 0.95 + 0.05 * fp1;
        ctx.save();
        ctx.scale(zoom1, zoom1); ctx.globalAlpha = alpha1;
        if (blur1 > 0.2) ctx.filter = `blur(${blur1.toFixed(1)}px)`;
        at(ctx, 0, -30, 1, () => layer(ctx, L.serif, () => drawTxt(ctx, L.serif, serifTxt, { fb: 'serif' })));
        ctx.restore();
      }
      if (hasText(sc) && t2 > 0) {
        const fp2 = clamp(t2 / 0.7), blur2 = Math.max(0, (1 - fp2) * 16);
        const alpha2 = clamp(t2 / 0.45), zoom2 = 0.95 + 0.05 * fp2;
        ctx.save();
        ctx.scale(zoom2, zoom2); ctx.globalAlpha = alpha2;
        if (blur2 > 0.2) ctx.filter = `blur(${blur2.toFixed(1)}px)`;
        at(ctx, 60, 22, 1, () => layer(ctx, sc, () =>
          drawTxt(ctx, sc, sc.text, { fb: 'cursive', fill: metallic(ctx, sc.color, -150, -30, 150, 30) })));
        ctx.restore();
      }
      return;
    }

    if (sub === '05d' && L.rule) {
      const rp = clamp(elapsed(u, L.rule) / 0.65);
      if (rp > 0) layer(ctx, L.rule, () => {
        const rl = L.rule, hw = rl.w / 2;
        const g = ctx.createLinearGradient(-hw, 0, hw, 0);
        g.addColorStop(0, rgba(rl.stroke, 0)); g.addColorStop(0.5, rgba(rl.stroke, 0.95)); g.addColorStop(1, rgba(rl.stroke, 0));
        ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-hw * rp, -88); ctx.lineTo(hw * rp, -88); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-hw * rp, 92); ctx.lineTo(hw * rp, 92); ctx.stroke();
        mark(ctx, 'rule', rl.w, 200);
      });
    }

    const es = spring(elapsed(u, L.serif), 10, 5);
    if (serifTxt && L.serif.visible && es > 0.01) at(ctx, 0, -32, es, () => layer(ctx, L.serif, () =>
      drawTxt(ctx, L.serif, serifTxt, { fb: 'serif', shadow: 'rgba(0,0,0,0.8)', blur: 18 })));

    const st = elapsed(u, sc), se = spring(st, 13, 6);
    if (st > 0) {
      ctx.save(); ctx.translate(65, 20); ctx.rotate(-0.06); ctx.scale(se, se);
      if (hasText(sc)) layer(ctx, sc, () => {
        drawTxt(ctx, sc, sc.text, { fb: 'cursive', fill: metallic(ctx, sc.color, -150, -30, 150, 30), shadow: rgba(sc.color, 0.65), blur: 24, oy: 5 });
      });
      if (sub === '05c' && L.swash) {
        const swT = elapsed(u, L.swash);
        if (swT > 0) layer(ctx, L.swash, () => {
          const w = L.swash.w * clamp(swT / 0.35);
          ctx.strokeStyle = L.swash.stroke; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(-0.47 * w, 45); ctx.bezierCurveTo(-0.118 * w, 52, 0.176 * w, 38, 0.53 * w, 48); ctx.stroke();
          mark(ctx, 'swash', L.swash.w, 30);
        });
      }
      if (L.spark) {
        const spT = elapsed(u, L.spark);
        if (spT > 0 && spT < 0.5) {
          const a = Math.sin((spT / 0.5) * Math.PI);
          layer(ctx, L.spark, () => {
            ctx.translate(130, -22);
            ctx.globalAlpha = clamp(a);
            ctx.fillStyle = L.spark.fill;
            ctx.beginPath(); ctx.arc(0, 0, L.spark.w / 2, 0, Math.PI * 2); ctx.fill();
            mark(ctx, 'spark', L.spark.w + 14, L.spark.w + 14);
          });
        }
      }
      ctx.restore();
    }
  };

  // ===== 3. VIRAIS =====
  R.viral = function (ctx, sub, u, L) {
    if (sub === 'snap_pop') {
      const enter = spring(elapsed(u, L.w1), 14, 6);
      const hit = elapsed(u, L.w2);
      const hitPop = hit > 0 ? 1 + 0.28 * Math.exp(-9 * hit) * Math.cos(18 * hit) : 1;
      const isHit = hit >= 0;
      if (enter <= 0.001) return;
      ctx.scale(enter, enter);
      const m1 = measure(ctx, L.w1, L.w1.text), m2 = measure(ctx, L.w2, L.w2.text), gap = 28;
      const sx = -(m1 + gap + m2) / 2;
      const sh = { shadow: 'rgba(0,0,0,0.85)', blur: 18, oy: 6 };
      if (hasText(L.w1)) at(ctx, sx + m1 / 2, 0, 1, () => layer(ctx, L.w1, () => drawTxt(ctx, L.w1, L.w1.text, sh)));
      if (hasText(L.w2)) at(ctx, sx + m1 + gap + m2 / 2, 0, hitPop, () => layer(ctx, L.w2, () =>
        drawTxt(ctx, L.w2, L.w2.text, Object.assign({ fill: isHit ? L.w2.color : L.w2.color2 }, sh))));
      return;
    }

    if (sub === 'pill_box') {
      const enter1 = spring(elapsed(u, L.w1), 14, 6);
      const enter2 = spring(elapsed(u, L.w2), 14, 6);
      const pillScale = spring(elapsed(u, L.pill), 15, 6.5);
      const m1 = measure(ctx, L.w1, L.w1.text), m2 = measure(ctx, L.w2, L.w2.text);
      const pillW = m2 + 64, gap = 18, sx = -(m1 + gap + pillW) / 2;
      if (hasText(L.w1) && enter1 > 0.01) at(ctx, sx + m1 / 2, 0, enter1, () => layer(ctx, L.w1, () => drawTxt(ctx, L.w1, L.w1.text)));
      const cx = sx + m1 + gap + pillW / 2;
      if (pillScale > 0.01) at(ctx, cx, 0, pillScale, () => layer(ctx, L.pill, () => {
        const pl = L.pill;
        ctx.fillStyle = pl.fill; rr(ctx, -pillW / 2, -pl.h / 2, pillW, pl.h, 24); ctx.fill();
        ctx.strokeStyle = pl.stroke; ctx.lineWidth = 3; ctx.stroke();
        mark(ctx, 'pill', pillW, pl.h);
      }));
      if (hasText(L.w2) && enter2 > 0.01) at(ctx, cx, 0, enter2, () => layer(ctx, L.w2, () =>
        drawTxt(ctx, L.w2, L.w2.text, { fill: pillScale > 0.65 ? L.w2.color : L.w2.color2 })));
      return;
    }

    if (sub === 'kinetic_slam') {
      const enter1 = spring(elapsed(u, L.top), 12, 6);
      const slamT = elapsed(u, L.slam);
      const shockT = elapsed(u, L.shock);
      if (enter1 > 0.01 && hasText(L.top)) at(ctx, 0, -52, enter1, () => layer(ctx, L.top, () => {
        ctx.globalAlpha = 1.0 - clamp(slamT / 0.30) * 0.45;
        drawTxt(ctx, L.top, L.top.text);
      }));
      if (slamT >= 0 && hasText(L.slam)) {
        ctx.save(); ctx.translate(0, 52);
        const sc = 1 + 0.82 * Math.exp(-9.5 * slamT) * Math.cos(15 * slamT);
        const sl = L.slam;
        layer(ctx, sl, () => {
          if (slamT < 0.16) {
            const ta = (1 - slamT / 0.16) * 0.35, ts = sc + (0.16 - slamT) * 1.6;
            ctx.save(); ctx.scale(ts, ts); ctx.globalAlpha = ta;
            ctx.font = fontOf(sl); ctx.fillStyle = sl.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(sl.text, 0, 0); ctx.restore();
          }
          ctx.scale(sc, sc);
          drawTxt(ctx, sl, sl.text, { shadow: rgba(sl.color, 0.65), blur: 28, oy: 6 });
        });
        ctx.restore();
      }
      if (shockT > 0 && shockT < 0.40 && L.shock) {
        ctx.save(); ctx.translate(0, 52);
        layer(ctx, L.shock, () => {
          const swP = shockT / 0.40, sk = L.shock;
          ctx.strokeStyle = rgba(sk.stroke, (1 - swP) * 0.55); ctx.lineWidth = 7 * (1 - swP);
          ctx.beginPath(); ctx.arc(0, 0, 90 + swP * sk.w, 0, Math.PI * 2); ctx.stroke();
        });
        ctx.restore();
      }
      return;
    }

    if (sub === 'luxury_script') {
      const bg = L.bg, fg = L.fg;
      const tBg = elapsed(u, bg);
      const p = clamp(tBg / 1.10);
      if (p > 0 && hasText(bg)) layer(ctx, bg, () => {
        const k = bg.size / 190;
        ctx.font = fontOf(bg, 'cursive'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tw = ctx.measureText(bg.text).width, startX = -tw / 2;
        const pw = p * p * (3 - 2 * p), headX = startX + tw * pw;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(startX - 50 * k, -120 * k); ctx.lineTo(headX + 36 * k, -120 * k);
        ctx.bezierCurveTo(headX + 28 * k, -35 * k, headX + 16 * k, 50 * k, headX - 10 * k, 120 * k);
        ctx.lineTo(startX - 50 * k, 120 * k); ctx.closePath(); ctx.clip();
        const drift = p >= 1 ? 1 + 0.025 * Math.sin((tBg - 1.10) * 2) : 1;
        ctx.scale(drift, drift); ctx.globalAlpha = 0.26; ctx.fillStyle = bg.color;
        ctx.fillText(bg.text, 0, -6 * k);
        ctx.restore();
        mark(ctx, 'bg', tw + 20, bg.size * 1.1);
      });
      const tFg = elapsed(u, fg);
      if (tFg >= 0 && hasText(fg)) layer(ctx, fg, () => {
        const s = fg.size, slideP = backOut(clamp(tFg / 0.62), 1.25);
        const alpha = clamp(tFg / 0.16), gleamP = P(tFg, 0.70, 1.38);
        ctx.font = fontOf(fg, 'serif');
        const tw = ctx.measureText(fg.text).width, CWd = Math.max(900, tw + 120);
        ctx.save();
        ctx.beginPath(); ctx.rect(-CWd / 2, -s * 1.1, CWd, s * 1.95); ctx.clip();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = fg.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const ty = s * 1.58 * (1 - slideP);
        ctx.fillText(fg.text, 0, ty);
        if (gleamP > 0 && gleamP < 1) {
          ctx.globalCompositeOperation = 'source-atop';
          const sw = -CWd / 2 + CWd * gleamP;
          const lg = ctx.createLinearGradient(sw - 65, -s, sw + 65, s);
          lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.95)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = lg; ctx.fillRect(-CWd / 2, -s * 1.1, CWd, s * 1.95);
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.restore();
        mark(ctx, 'fg', tw + 20, s * 1.2);
      });
    }
  };

  // ===== 4. ELEMENTOS =====
  R.element = function (ctx, sub, u, L) {
    if (sub === 'pop') {
      const scBox = spring(elapsed(u, L.box), 15, 6.5);
      const scVal = spring(elapsed(u, L.value), 15, 6.5);
      if (scBox > 0.002) at(ctx, 0, 0, scBox, () => layer(ctx, L.box, () => {
        const b = L.box;
        ctx.fillStyle = paint(ctx, b, 'fill', -b.w / 2, -b.h / 2, b.w / 2, b.h / 2);
        rr(ctx, -b.w / 2, -b.h / 2, b.w, b.h, 28); ctx.fill();
        ctx.strokeStyle = b.stroke; ctx.lineWidth = 3; rr(ctx, -b.w / 2, -b.h / 2, b.w, b.h, 28); ctx.stroke();
        mark(ctx, 'box', b.w, b.h);
      }));
      if (hasText(L.value) && scVal > 0.002) at(ctx, 0, 3, scVal, () => layer(ctx, L.value, () => drawTxt(ctx, L.value, L.value.text)));
      return;
    }

    if (sub === 'slash') {
      const e1 = spring(elapsed(u, L.old), 14, 6.5);
      const slashP = clamp(elapsed(u, L.strike) / 0.30);
      const eBox = spring(elapsed(u, L.box), 15, 7);
      const eNew = spring(elapsed(u, L.new), 15, 7);
      if (e1 > 0.01 && hasText(L.old)) at(ctx, -130, 0, e1, () => layer(ctx, L.old, () => drawTxt(ctx, L.old, L.old.text)));
      if (slashP > 0 && L.strike) at(ctx, -130, 0, 1, () => layer(ctx, L.strike, () => {
        const w = L.strike.w;
        ctx.strokeStyle = L.strike.stroke; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-w / 2, 16); ctx.lineTo(-w / 2 + w * slashP, 16 - 32 * slashP); ctx.stroke();
        mark(ctx, 'strike', w, 40);
      }));
      if (eBox > 0.01 && L.box) at(ctx, 130, 0, eBox, () => layer(ctx, L.box, () => {
        const b = L.box;
        ctx.fillStyle = paint(ctx, b, 'fill', -b.w / 2, -b.h / 2, b.w / 2, b.h / 2);
        rr(ctx, -b.w / 2, -b.h / 2, b.w, b.h, 22); ctx.fill();
        ctx.strokeStyle = b.stroke; ctx.lineWidth = 3; rr(ctx, -b.w / 2, -b.h / 2, b.w, b.h, 22); ctx.stroke();
        mark(ctx, 'box', b.w, b.h);
      }));
      if (eNew > 0.01 && hasText(L.new)) at(ctx, 130, 2, eNew, () => layer(ctx, L.new, () => drawTxt(ctx, L.new, L.new.text)));
      return;
    }

    if (sub === 'count_up') {
      const target = parseInt(String(L.value.text).replace(/\D/g, ''), 10) || 0;
      const tVal = elapsed(u, L.value);
      const tUnit = elapsed(u, L.unit);
      const tBar = elapsed(u, L.bar);
      if (tVal < 0 && tUnit < 0 && tBar < 0) return;

      const p = clamp(tVal / 2.35), v = Math.round(target * (1 - Math.pow(1 - p, 4)));
      const land = tVal - 2.35, pop = 1 + (land > 0 ? 0.07 * Math.exp(-7 * land) * Math.cos(15 * land) : 0);
      ctx.scale(pop, pop);
      const landed = land > 0;
      const wn = measure(ctx, L.value, target.toLocaleString('pt-BR'));
      const hasUnit = hasText(L.unit) && tUnit >= 0;
      const wu = hasText(L.unit) ? measure(ctx, L.unit, L.unit.text) : 0, gap = hasText(L.unit) ? 18 : 0;
      const sx = -(wn + gap + wu) / 2;
      if (L.value.visible && tVal >= 0) at(ctx, sx + wn / 2, -10, 1, () => layer(ctx, L.value, () => {
        drawTxt(ctx, L.value, v.toLocaleString('pt-BR'), { align: 'right', x: wn / 2, fill: landed ? L.value.color2 : L.value.color });
      }));
      if (hasUnit) at(ctx, sx + wn + gap + wu / 2, -10, 1, () => layer(ctx, L.unit, () =>
        drawTxt(ctx, L.unit, L.unit.text, { fill: (tUnit - 2.35 > 0) ? L.unit.color2 : L.unit.color })));
      if (tBar >= 0) {
        const pBar = clamp(tBar / 2.35);
        at(ctx, 0, 39, 1, () => layer(ctx, L.bar, () => {
          const b = L.bar;
          ctx.globalAlpha = 0.2; ctx.fillStyle = b.stroke; rr(ctx, -b.w / 2, -b.h / 2, b.w, b.h, b.h / 2); ctx.fill();
          ctx.globalAlpha = 1; ctx.fillStyle = b.fill;
          if (pBar > 0) { rr(ctx, -b.w / 2, -b.h / 2, b.w * pBar, b.h, b.h / 2); ctx.fill(); }
          mark(ctx, 'bar', b.w, Math.max(b.h, 16));
        }));
      }
      return;
    }

    if (sub === 'highlighter') {
      const enter = spring(elapsed(u, L.word), 14, 6);
      const hP = clamp(elapsed(u, L.marker) / 0.65);
      const wd = L.word, wW = measure(ctx, wd, wd.text);
      if (hP > 0) at(ctx, 0, 17.5, 1, () => layer(ctx, L.marker, () => {
        const mk = L.marker, W = wW + 40, hW = W * hP;
        ctx.fillStyle = paint(ctx, mk, 'fill', -W / 2, 0, -W / 2 + hW, 0);
        rr(ctx, -W / 2, -mk.h / 2, hW, mk.h, 12); ctx.fill();
        mark(ctx, 'marker', W, mk.h);
      }));
      if (hasText(wd) && enter > 0.01) at(ctx, 0, 15, enter, () => layer(ctx, wd, () => drawTxt(ctx, wd, wd.text)));
      return;
    }

    if (sub === 'stamp') {
      const stDisc = elapsed(u, L.disc);
      const stL1 = elapsed(u, L.line1);
      const stL2 = elapsed(u, L.line2);
      if (stDisc >= 0) {
        const sc = 1 + 0.65 * Math.exp(-8 * stDisc) * Math.cos(16 * stDisc);
        at(ctx, 0, 0, sc, () => layer(ctx, L.disc, () => {
          const d = L.disc;
          ctx.beginPath(); ctx.arc(0, 0, d.w / 2, 0, Math.PI * 2);
          ctx.fillStyle = d.fill; ctx.fill(); ctx.strokeStyle = d.stroke; ctx.lineWidth = 6; ctx.stroke();
          mark(ctx, 'disc', d.w, d.w);
        }));
      }
      if (hasText(L.line1) && stL1 >= 0) {
        const sc1 = 1 + 0.65 * Math.exp(-8 * stL1) * Math.cos(16 * stL1);
        at(ctx, 0, -12, sc1, () => layer(ctx, L.line1, () => drawTxt(ctx, L.line1, L.line1.text)));
      }
      if (hasText(L.line2) && stL2 >= 0) {
        const sc2 = 1 + 0.65 * Math.exp(-8 * stL2) * Math.cos(16 * stL2);
        at(ctx, 0, 18, sc2, () => layer(ctx, L.line2, () => drawTxt(ctx, L.line2, L.line2.text)));
      }
      return;
    }

    if (sub === 'lower_third') {
      const ePlate = spring(elapsed(u, L.plate), 12, 6);
      const eName = spring(elapsed(u, L.name), 12, 6);
      const eRole = spring(elapsed(u, L.role), 12, 6);
      if (ePlate > 0.002) at(ctx, 0, 0, ePlate, () => layer(ctx, L.plate, () => {
        const p = L.plate;
        ctx.fillStyle = p.fill; rr(ctx, -p.w / 2, -p.h / 2, p.w, p.h, 18); ctx.fill();
        ctx.strokeStyle = p.stroke; ctx.lineWidth = 2.5; ctx.stroke();
        mark(ctx, 'plate', p.w, p.h);
      }));
      if (hasText(L.name) && eName > 0.002) at(ctx, 0, -10, eName, () => layer(ctx, L.name, () => drawTxt(ctx, L.name, L.name.text)));
      if (hasText(L.role) && eRole > 0.002) at(ctx, 0, 18, eRole, () => layer(ctx, L.role, () => drawTxt(ctx, L.role, L.role.text)));
    }
  };

  // ===== 5. TEXT ANIMATION (AUTOEDIT & ELEVEN PERCENT) =====
  R.text_anim = function (ctx, sub, u, L, cfg, rawU) {
    if (sub === 'karaoke_bounce') {
      const dur = cfg.duration || 3.2;
      const out = P(rawU, Math.max(0.2, dur - 0.25), dur);
      if (1 - out * out <= 0.001) return;
      ctx.globalAlpha = 1 - out * out;
      ctx.scale(1 - 0.03 * out * out, 1 - 0.03 * out * out);

      const bd = L.badge;
      if (bd && bd.visible) {
        const eBd = P(u, bd.start, bd.start + 0.35 / bd.speed);
        if (eBd > 0.001) at(ctx, 0, 0, 1, () => layer(ctx, bd, () => {
          ctx.save();
          ctx.globalAlpha *= eBd;
          ctx.fillStyle = bd.fill || 'rgba(18, 4, 12, 0.75)';
          rr(ctx, -bd.w / 2, -bd.h / 2, bd.w, bd.h, 24);
          ctx.fill();
          ctx.strokeStyle = bd.stroke || 'rgba(255, 209, 102, 0.25)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
          mark(ctx, 'badge', bd.w, bd.h);
        }));
      }

      const tx = L.text;
      if (tx && tx.visible && String(tx.text || '').trim()) {
        layer(ctx, tx, () => {
          const fontStr = fontOf(tx);
          ctx.font = fontStr;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const tokens = parseTextWithHighlights(tx.text);
          const layout = layoutWords(ctx, tokens, fontStr);
          const items = layout.items;
          const N = items.length;
          const step = (0.24 / tx.speed);

          items.forEach((item, i) => {
            const tStart = tx.start + i * step;
            const el = u - tStart;
            let a = 0.32, s = 1.0, dy = 0;
            let isActive = false;

            if (el >= 0) {
              const pBounce = clamp(el * tx.speed / 0.32);
              const spr = spring(el * tx.speed * 2.8, 16, 7);
              s = 1.0 + (1 - spr) * 0.35;
              dy = -Math.sin(pBounce * Math.PI) * 22;
              a = 1.0;
              const isCurrent = (u >= tStart && (i === N - 1 || u < tStart + step * 1.3));
              if (isCurrent) isActive = true;
            }

            ctx.save();
            ctx.translate(item.cx, dy);
            ctx.scale(s, s);
            ctx.globalAlpha *= a;

            const isHigh = item.highlight || isActive;
            const color = isHigh ? (tx.color2 || '#FFD166') : (tx.color || '#FAF6EE');
            ctx.fillStyle = color;

            if (isHigh) {
              ctx.shadowColor = tx.color2 || '#FFD166';
              ctx.shadowBlur = (tx.glow || 28) * (isActive ? 1.3 : 0.8);
            } else {
              ctx.shadowColor = 'transparent';
              ctx.shadowBlur = 0;
            }

            ctx.fillText(item.text, 0, 0);
            ctx.restore();
          });

          mark(ctx, 'text', layout.totalW + 20, tx.size * 1.3);
        });
      }
    }

    if (sub === 'sliding_pill') {
      const dur = cfg.duration || 3.2;
      const out = P(rawU, Math.max(0.2, dur - 0.25), dur);
      if (1 - out * out <= 0.001) return;
      ctx.globalAlpha = 1 - out * out;
      ctx.scale(1 - 0.03 * out * out, 1 - 0.03 * out * out);

      const tx = L.text;
      const pl = L.pill;
      if (tx && tx.visible && String(tx.text || '').trim()) {
        layer(ctx, tx, () => {
          const fontStr = fontOf(tx);
          ctx.font = fontStr;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const tokens = parseTextWithHighlights(tx.text);
          const layout = layoutWords(ctx, tokens, fontStr);
          const items = layout.items;
          const N = items.length;

          if (pl && pl.visible && N > 0) {
            const step = 0.40 / pl.speed;
            const curIdxF = clamp((u - pl.start) / step, 0, N - 1);
            const idx0 = Math.floor(curIdxF);
            const idx1 = Math.min(N - 1, idx0 + 1);
            const frac = curIdxF - idx0;
            const easedFrac = frac <= 0 ? 0 : 1 - Math.pow(1 - frac, 3);

            const w0 = items[idx0];
            const w1 = items[idx1];
            const curX = w0.cx + (w1.cx - w0.cx) * easedFrac + pl.dx;
            const padX = 32;
            const curW = (w0.w + (w1.w - w0.w) * easedFrac) + padX * 2;
            const pillH = pl.h || 96;
            const r = Math.min(pillH / 2, curW / 2);

            const enterP = clamp((u - pl.start) * pl.speed * 3.0);
            const enterScale = spring(enterP * 0.8, 14, 6);

            if (enterScale > 0.01) {
              ctx.save();
              ctx.translate(curX, pl.dy);
              ctx.scale(enterScale, enterScale);
              ctx.shadowColor = rgba(pl.fill || '#FFD166', 0.45);
              ctx.shadowBlur = 24;
              ctx.shadowOffsetY = 4;
              ctx.fillStyle = pl.fill || '#FFD166';
              rr(ctx, -curW / 2, -pillH / 2, curW, pillH, r);
              ctx.fill();
              ctx.shadowColor = 'transparent';
              ctx.strokeStyle = pl.stroke || '#FFFDF5';
              ctx.lineWidth = 1.8;
              rr(ctx, -curW / 2, -pillH / 2, curW, pillH, r);
              ctx.stroke();
              ctx.restore();
            }

            // Texto normal
            items.forEach((item) => {
              ctx.save();
              ctx.translate(item.cx, 0);
              const isHigh = item.highlight;
              ctx.fillStyle = isHigh ? (pl.fill || '#FFD166') : (tx.color || '#FAF6EE');
              if (isHigh) {
                ctx.shadowColor = pl.fill || '#FFD166';
                ctx.shadowBlur = 18;
              }
              ctx.fillText(item.text, 0, 0);
              ctx.restore();
            });

            // Texto sob a pílula com contraste perfeito
            if (enterScale > 0.01) {
              ctx.save();
              ctx.beginPath();
              rr(ctx, curX - curW / 2, pl.dy - pillH / 2, curW, pillH, r);
              ctx.clip();
              items.forEach((item) => {
                ctx.save();
                ctx.translate(item.cx, 0);
                ctx.fillStyle = tx.color2 || '#12040C';
                ctx.shadowColor = 'transparent';
                ctx.fillText(item.text, 0, 0);
                ctx.restore();
              });
              ctx.restore();
            }
          } else {
            items.forEach((item) => {
              ctx.save();
              ctx.translate(item.cx, 0);
              ctx.fillStyle = item.highlight ? (tx.color2 || '#FFD166') : (tx.color || '#FAF6EE');
              ctx.fillText(item.text, 0, 0);
              ctx.restore();
            });
          }

          mark(ctx, 'text', layout.totalW + 20, tx.size * 1.3);
        });
      }
    }

    if (sub === 'blur_glow_in') {
      const dur = cfg.duration || 3.2;
      const out = P(rawU, Math.max(0.2, dur - 0.25), dur);
      if (1 - out * out <= 0.001) return;
      ctx.globalAlpha = 1 - out * out;
      ctx.scale(1 - 0.03 * out * out, 1 - 0.03 * out * out);

      const tx = L.text;
      if (tx && tx.visible && String(tx.text || '').trim()) {
        layer(ctx, tx, () => {
          const fontStr = fontOf(tx);
          ctx.font = fontStr;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const tokens = parseTextWithHighlights(tx.text);
          const layout = layoutWords(ctx, tokens, fontStr);
          const items = layout.items;
          const step = 0.16 / tx.speed;

          items.forEach((item, i) => {
            const t0 = tx.start + i * step;
            const el = u - t0;
            if (el < 0) return;
            const p = clamp(el * tx.speed / 0.42);
            const ease = 1 - Math.pow(1 - p, 3);
            const blurVal = Math.max(0, (1 - ease) * 22);
            const scaleVal = 1.0 + (1 - ease) * 0.28;
            const dyVal = -(1 - ease) * 16;

            ctx.save();
            ctx.translate(item.cx, dyVal);
            ctx.scale(scaleVal, scaleVal);
            ctx.globalAlpha *= clamp(ease * 1.2);

            if (blurVal > 0.4 && typeof ctx.filter !== 'undefined') {
              ctx.filter = `blur(${blurVal.toFixed(1)}px)`;
            } else {
              ctx.filter = 'none';
            }

            const isHigh = item.highlight;
            const color = isHigh ? (tx.color2 || '#FF2E7E') : (tx.color || '#FAF6EE');
            ctx.fillStyle = color;

            const flash = Math.sin(p * Math.PI);
            ctx.shadowColor = isHigh ? (tx.color2 || '#FF2E7E') : '#FAF6EE';
            ctx.shadowBlur = (tx.glow || 32) * (isHigh ? 1.4 : 0.8) * (flash * 1.5 + (isHigh ? 0.6 : 0.2));

            ctx.fillText(item.text, 0, 0);
            ctx.restore();
          });
          ctx.filter = 'none';
          mark(ctx, 'text', layout.totalW + 20, tx.size * 1.3);
        });
      }

      const sb = L.sub;
      if (sb && sb.visible && String(sb.text || '').trim()) {
        const elSb = u - sb.start;
        if (elSb > 0) {
          const pSb = clamp(elSb * sb.speed / 0.5);
          const easeSb = 1 - Math.pow(1 - pSb, 3);
          at(ctx, 0, 68, 1, () => layer(ctx, sb, () => {
            ctx.save();
            ctx.globalAlpha *= easeSb;
            ctx.font = fontOf(sb);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = sb.color || '#DFC89D';
            ctx.shadowColor = rgba(sb.color || '#DFC89D', 0.4);
            ctx.shadowBlur = 12;
            ctx.fillText(sb.text, 0, (1 - easeSb) * 14);
            ctx.restore();
            mark(ctx, 'sub', 600, sb.size * 1.5);
          }));
        }
      }
    }

    if (sub === 'kinetic_stack') {
      const dur = cfg.duration || 3.2;
      const out = P(rawU, Math.max(0.2, dur - 0.25), dur);
      if (1 - out * out <= 0.001) return;
      ctx.globalAlpha = 1 - out * out;
      ctx.scale(1 - 0.03 * out * out, 1 - 0.03 * out * out);

      const l1 = L.line1;
      const l2 = L.line2;
      const l3 = L.line3;

      if (l1 && l1.visible && String(l1.text || '').trim()) {
        const el = u - l1.start;
        if (el > 0) {
          const spr = spring(el * l1.speed * 2.5, 14, 6);
          at(ctx, 0, -82 + (1 - spr) * -20, 1, () => layer(ctx, l1, () => {
            ctx.save();
            ctx.globalAlpha *= clamp(spr);
            ctx.font = fontOf(l1);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = l1.color || '#FAF6EE';
            ctx.fillText(cleanAsterisks(l1.text), 0, 0);
            ctx.restore();
            mark(ctx, 'line1', measure(ctx, l1, cleanAsterisks(l1.text)), l1.size * 1.2);
          }));
        }
      }

      if (l2 && l2.visible && String(l2.text || '').trim()) {
        const el = u - l2.start;
        if (el > 0) {
          const spr = spring(el * l2.speed * 2.8, 16, 6);
          const sHero = 1.0 + (1 - spr) * 0.4;
          at(ctx, 0, 6, sHero, () => layer(ctx, l2, () => {
            const fontStr = fontOf(l2);
            ctx.font = fontStr;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const tokens = parseTextWithHighlights(l2.text);
            const layout = layoutWords(ctx, tokens, fontStr);

            layout.items.forEach(item => {
              ctx.save();
              ctx.translate(item.cx, 0);
              const isHigh = item.highlight;
              ctx.fillStyle = isHigh ? (l2.color2 || '#FFD166') : (l2.color || '#FAF6EE');
              if (isHigh) {
                ctx.shadowColor = l2.color2 || '#FFD166';
                ctx.shadowBlur = (l2.glow || 30);
              }
              ctx.fillText(item.text, 0, 0);
              ctx.restore();
            });
            mark(ctx, 'line2', layout.totalW, l2.size * 1.3);
          }));
        }
      }

      if (l3 && l3.visible && String(l3.text || '').trim()) {
        const el = u - l3.start;
        if (el > 0) {
          const spr = spring(el * l3.speed * 2.5, 14, 6);
          at(ctx, 0, 94 + (1 - spr) * 20, 1, () => layer(ctx, l3, () => {
            ctx.save();
            ctx.globalAlpha *= clamp(spr);
            ctx.font = fontOf(l3);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = l3.color || '#DFC89D';
            ctx.fillText(cleanAsterisks(l3.text), 0, 0);
            ctx.restore();
            mark(ctx, 'line3', measure(ctx, l3, cleanAsterisks(l3.text)), l3.size * 1.2);
          }));
        }
      }
    }

    if (sub === 'clean_callout') {
      const dur = cfg.duration || 3.4;
      const out = P(rawU, Math.max(0.2, dur - 0.25), dur);
      if (1 - out * out <= 0.001) return;
      ctx.globalAlpha = 1 - out * out;
      ctx.scale(1 - 0.03 * out * out, 1 - 0.03 * out * out);

      const gd = L.guide;
      const tl = L.title;
      const sb = L.sub;

      const guideW = (gd && gd.w) || 860;
      const startX = -guideW / 2;

      if (gd && gd.visible) {
        layer(ctx, gd, () => {
          const el = u - gd.start;
          if (el > 0) {
            const pDot = clamp(el * gd.speed * 3.0);
            const sprDot = spring(pDot, 15, 6);
            ctx.save();
            ctx.fillStyle = gd.fill || '#FF2E7E';
            ctx.shadowColor = gd.fill || '#FF2E7E';
            ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.arc(startX, 0, 6 * sprDot, 0, Math.PI * 2);
            ctx.fill();

            const ringR = 14 + Math.sin(el * 6) * 3;
            ctx.strokeStyle = gd.fill || '#FF2E7E';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(startX, 0, Math.max(1, ringR * sprDot), 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            const pLine = clamp((el - 0.12) * gd.speed * 2.2);
            if (pLine > 0) {
              const curW = guideW * (1 - Math.pow(1 - pLine, 3));
              ctx.save();
              ctx.strokeStyle = gd.stroke || '#FFD166';
              ctx.lineWidth = 2.2;
              ctx.shadowColor = rgba(gd.stroke || '#FFD166', 0.5);
              ctx.shadowBlur = 14;
              ctx.beginPath();
              ctx.moveTo(startX, 0);
              ctx.lineTo(startX + curW, 0);
              ctx.stroke();

              ctx.fillStyle = '#FFFFFF';
              ctx.beginPath();
              ctx.arc(startX + curW, 0, 3, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }
          }
          mark(ctx, 'guide', guideW, 40);
        });
      }

      if (tl && tl.visible && String(tl.text || '').trim()) {
        const el = u - tl.start;
        if (el > 0) {
          const p = clamp(el * tl.speed * 2.0);
          const ease = 1 - Math.pow(1 - p, 3);
          const riseY = (1 - ease) * 55;

          layer(ctx, tl, () => {
            ctx.save();
            ctx.beginPath();
            ctx.rect(startX - 20, -300, guideW + 60, 300);
            ctx.clip();

            ctx.translate(startX + 24, -36 + riseY);
            const fontStr = fontOf(tl);
            ctx.font = fontStr;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            const tokens = parseTextWithHighlights(tl.text);

            let curX = 0;
            const spaceW = ctx.measureText(' ').width;
            tokens.forEach(tok => {
              const w = ctx.measureText(tok.text).width;
              ctx.save();
              ctx.translate(curX, 0);
              const isHigh = tok.highlight;
              ctx.fillStyle = isHigh ? (tl.color2 || '#FFD166') : (tl.color || '#FAF6EE');
              if (isHigh) {
                ctx.shadowColor = tl.color2 || '#FFD166';
                ctx.shadowBlur = (tl.glow || 24);
              }
              ctx.fillText(tok.text, 0, 0);
              ctx.restore();
              curX += w + spaceW;
            });
            ctx.restore();
            mark(ctx, 'title', guideW, tl.size * 1.3);
          });
        }
      }

      if (sb && sb.visible && String(sb.text || '').trim()) {
        const el = u - sb.start;
        if (el > 0) {
          const p = clamp(el * sb.speed * 2.0);
          const ease = 1 - Math.pow(1 - p, 3);
          layer(ctx, sb, () => {
            ctx.save();
            ctx.globalAlpha *= ease;
            ctx.translate(startX + 24, 28 + (1 - ease) * 15);
            ctx.font = fontOf(sb);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = sb.color || '#A39281';
            ctx.shadowColor = 'transparent';
            ctx.fillText(cleanAsterisks(sb.text), 0, 0);
            ctx.restore();
            mark(ctx, 'sub', guideW, sb.size * 1.3);
          });
        }
      }
    }

    if (sub === 'typewriter_neon') {
      const dur = cfg.duration || 3.2;
      const out = P(rawU, Math.max(0.2, dur - 0.25), dur);
      if (1 - out * out <= 0.001) return;
      ctx.globalAlpha = 1 - out * out;
      ctx.scale(1 - 0.03 * out * out, 1 - 0.03 * out * out);

      const pn = L.panel;
      if (pn && pn.visible) {
        layer(ctx, pn, () => {
          ctx.save();
          ctx.fillStyle = pn.fill || '#0E040B';
          rr(ctx, -pn.w / 2, -pn.h / 2, pn.w, pn.h, 16);
          ctx.fill();
          ctx.strokeStyle = pn.stroke || '#331123';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
          mark(ctx, 'panel', pn.w, pn.h);
        });
      }

      const tx = L.text;
      if (tx && tx.visible && String(tx.text || '').trim()) {
        layer(ctx, tx, () => {
          const fontStr = fontOf(tx);
          ctx.font = fontStr;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';

          const tokens = parseTextWithHighlights(tx.text);
          const chars = [];
          tokens.forEach((tok, tIdx) => {
            if (tIdx > 0) chars.push({ char: ' ', highlight: false });
            for (let c of tok.text) {
              chars.push({ char: c, highlight: tok.highlight });
            }
          });

          const totalChars = chars.length;
          const cleanStr = chars.map(c => c.char).join('');
          const totalW = ctx.measureText(cleanStr).width;
          const startX = -totalW / 2;

          const el = u - tx.start;
          let numTyped = 0;
          if (el > 0) {
            const typingDuration = Math.max(0.5, (totalChars * 0.045) / tx.speed);
            const p = clamp(el / typingDuration);
            numTyped = Math.floor(p * totalChars);
          }

          let curX = startX;
          for (let i = 0; i < numTyped; i++) {
            const ch = chars[i];
            const chW = ctx.measureText(ch.char).width;
            ctx.save();
            ctx.fillStyle = ch.highlight ? (tx.color2 || '#22D3EE') : (tx.color || '#FAF6EE');
            if (ch.highlight) {
              ctx.shadowColor = tx.color2 || '#22D3EE';
              ctx.shadowBlur = (tx.glow || 20);
            }
            ctx.fillText(ch.char, curX, 0);
            ctx.restore();
            curX += chW;
          }

          const isCursorBlink = Math.sin((u - tx.start) * 12) > -0.2;
          if (isCursorBlink && el >= 0) {
            ctx.save();
            const curH = tx.size * 1.1;
            ctx.fillStyle = tx.color2 || '#22D3EE';
            ctx.shadowColor = tx.color2 || '#22D3EE';
            ctx.shadowBlur = (tx.glow || 20) + 4;
            ctx.fillRect(curX + 3, -curH / 2, 4, curH);
            ctx.restore();
          }

          mark(ctx, 'text', totalW + 20, tx.size * 1.3);
        });
      }
    }

    if (sub === 'wave_kinetic') {
      const dur = cfg.duration || 3.4;
      const out = P(rawU, Math.max(0.2, dur - 0.25), dur);
      if (1 - out * out <= 0.001) return;
      ctx.globalAlpha = 1 - out * out;
      ctx.scale(1 - 0.03 * out * out, 1 - 0.03 * out * out);

      const tx = L.text;
      if (tx && tx.visible && String(tx.text || '').trim()) {
        layer(ctx, tx, () => {
          const fontStr = fontOf(tx);
          ctx.font = fontStr;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const tokens = parseTextWithHighlights(tx.text);
          const layout = layoutWords(ctx, tokens, fontStr);
          const items = layout.items;
          const step = 0.12 / tx.speed;

          items.forEach((item, i) => {
            const t0 = tx.start + i * step;
            const el = u - t0;
            if (el < 0) return;
            const pEnter = clamp(el * tx.speed * 2.8);
            const spr = spring(pEnter, 15, 6);

            const waveT = el * 3.6;
            const waveDy = Math.sin(waveT + i * 0.75) * 13;
            const waveRot = Math.cos(waveT + i * 0.75) * 0.035;

            ctx.save();
            ctx.translate(item.cx, (1 - spr) * 30 + waveDy);
            ctx.rotate(waveRot);
            ctx.scale(spr, spr);

            const isHigh = item.highlight;
            ctx.fillStyle = isHigh ? (tx.color2 || '#FFD166') : (tx.color || '#FAF6EE');
            if (isHigh) {
              ctx.shadowColor = tx.color2 || '#FFD166';
              ctx.shadowBlur = (tx.glow || 26) + Math.sin(waveT * 1.5) * 6;
            }
            ctx.fillText(item.text, 0, 0);
            ctx.restore();
          });

          mark(ctx, 'text', layout.totalW + 20, tx.size * 1.3);
        });
      }

      const sb = L.sub;
      if (sb && sb.visible && String(sb.text || '').trim()) {
        const elSb = u - sb.start;
        if (elSb > 0) {
          const p = clamp(elSb * sb.speed * 2.0);
          const spr = spring(p, 14, 6);
          const waveDy = -Math.sin(elSb * 3.2) * 6;
          at(ctx, 0, 68 + waveDy, spr, () => layer(ctx, sb, () => {
            ctx.save();
            ctx.font = fontOf(sb);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = sb.color || '#DFC89D';
            ctx.shadowColor = 'transparent';
            ctx.fillText(cleanAsterisks(sb.text), 0, 0);
            ctx.restore();
            mark(ctx, 'sub', 600, sb.size * 1.3);
          }));
        }
      }
    }

    if (sub === 'split_reveal') {
      const dur = cfg.duration || 3.2;
      const out = P(rawU, Math.max(0.2, dur - 0.25), dur);
      if (1 - out * out <= 0.001) return;
      ctx.globalAlpha = 1 - out * out;
      ctx.scale(1 - 0.03 * out * out, 1 - 0.03 * out * out);

      const ln = L.line;
      const tl = L.title;
      const sb = L.sub;

      const lineW = (ln && ln.w) || 980;

      if (ln && ln.visible) {
        layer(ctx, ln, () => {
          const el = u - ln.start;
          if (el > 0) {
            const p = clamp(el * ln.speed * 2.5);
            const curW = lineW * (1 - Math.pow(1 - p, 3));
            ctx.save();
            ctx.strokeStyle = ln.stroke || '#FFD166';
            ctx.lineWidth = 2.0;
            ctx.shadowColor = rgba(ln.stroke || '#FFD166', 0.6);
            ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.moveTo(-curW / 2, 0);
            ctx.lineTo(curW / 2, 0);
            ctx.stroke();

            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(0, 0, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
          mark(ctx, 'line', lineW, 20);
        });
      }

      if (tl && tl.visible && String(tl.text || '').trim()) {
        const el = u - tl.start;
        if (el > 0) {
          const p = clamp(el * tl.speed * 2.2);
          const ease = 1 - Math.pow(1 - p, 3);
          const dy = (1 - ease) * 50;

          layer(ctx, tl, () => {
            ctx.save();
            ctx.beginPath();
            ctx.rect(-CW, -CH, CW * 2, CH);
            ctx.clip();

            ctx.translate(0, -42 + dy);
            const fontStr = fontOf(tl);
            ctx.font = fontStr;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const tokens = parseTextWithHighlights(tl.text);
            const layout = layoutWords(ctx, tokens, fontStr);

            layout.items.forEach(item => {
              ctx.save();
              ctx.translate(item.cx, 0);
              const isHigh = item.highlight;
              ctx.fillStyle = isHigh ? (tl.color2 || '#FFD166') : (tl.color || '#FAF6EE');
              if (isHigh) {
                ctx.shadowColor = tl.color2 || '#FFD166';
                ctx.shadowBlur = (tl.glow || 26);
              }
              ctx.fillText(item.text, 0, 0);
              ctx.restore();
            });
            ctx.restore();
            mark(ctx, 'title', layout.totalW + 20, tl.size * 1.3);
          });
        }
      }

      if (sb && sb.visible && String(sb.text || '').trim()) {
        const el = u - sb.start;
        if (el > 0) {
          const p = clamp(el * sb.speed * 2.2);
          const ease = 1 - Math.pow(1 - p, 3);
          const dy = -(1 - ease) * 40;

          layer(ctx, sb, () => {
            ctx.save();
            ctx.beginPath();
            ctx.rect(-CW, 0, CW * 2, CH);
            ctx.clip();

            ctx.translate(0, 36 + dy);
            ctx.font = fontOf(sb);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = sb.color || '#DFC89D';
            ctx.shadowColor = 'transparent';
            ctx.fillText(cleanAsterisks(sb.text), 0, 0);
            ctx.restore();
            mark(ctx, 'sub', measure(ctx, sb, cleanAsterisks(sb.text)), sb.size * 1.3);
          });
        }
      }
    }
  };

  /* ---------- API pública ---------- */
  E.draw = function (ctx, cat, sub, u, cfg) {
    cfg = cfg || {};
    if (cat === 'update') cat = (cfg && (cfg.cat || cfg.mode)) || 'viral';
    if (!sub || sub === 'update') sub = (cfg && (cfg.subType || cfg.sub)) || 'kinetic_slam';
    E.hits.length = 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.clearRect(0, 0, CW, CH);
    const fn = R[cat];
    if (!fn) return;
    const globalDelay = parseFloat(cfg.globalDelay) || 0;
    const globalSpeed = Math.max(0.1, parseFloat(cfg.globalSpeed) || 1.0);
    const uEff = (u - globalDelay) * globalSpeed;
    if (uEff < 0) return;

    const L = resolve(cat, sub, cfg);
    const X = CW * (cfg.posX !== undefined && !isNaN(cfg.posX) ? cfg.posX : 0.5);
    const Y = CH * (cfg.posY !== undefined && !isNaN(cfg.posY) ? cfg.posY : 0.5);
    const gs = cfg.globalScale || 1.0;
    ctx.save();
    ctx.translate(X, Y);
    ctx.scale(gs, gs);
    fn(ctx, sub, uEff, L, cfg, u);
    ctx.restore();
  };

  E.preload = function (cat, sub, cfg) {
    cfg = cfg || {};
    if (cat === 'update') cat = (cfg && (cfg.cat || cfg.mode)) || 'viral';
    if (!sub || sub === 'update') sub = (cfg && (cfg.subType || cfg.sub)) || 'kinetic_slam';
    if (typeof document === 'undefined' || !document.fonts || !document.fonts.load) return Promise.resolve();
    const L = resolve(cat, sub, cfg || {});
    const jobs = [];
    Object.keys(L).forEach(id => {
      const l = L[id];
      if (l.kind === 'text') {
        const cleanStr = cleanAsterisks(l.text || 'Aa');
        jobs.push(document.fonts.load(`${l.weight} ${l.size}px "${l.font}"`, cleanStr + 'ÁÇÃÕÉ').catch(() => { }));
        jobs.push(document.fonts.load(`italic ${l.weight} ${l.size}px "${l.font}"`, cleanStr + 'ÁÇÃÕÉ').catch(() => { }));
      }
    });
    return Promise.all(jobs);
  };

  root.CherryEngine = E;
})(typeof window !== 'undefined' ? window : globalThis);
