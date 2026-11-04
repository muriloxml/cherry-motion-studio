const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const STUDIO_DIR = __dirname;
const FFMPEG_BIN = path.join(STUDIO_DIR, 'bin', 'ffmpeg.exe');
const MOGRTS_DIR = path.join(STUDIO_DIR, 'mogrts');
const CHERRY_DIR = path.join(MOGRTS_DIR, 'Cherry Motions');

if (!fs.existsSync(CHERRY_DIR)) {
  fs.mkdirSync(CHERRY_DIR, { recursive: true });
}

const TEMP_DIR = path.join(STUDIO_DIR, 'render_frames', 'mogrt_build_temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// 1. Extração das bases caso ainda não existam
const BOLD_ZIP = path.join(MOGRTS_DIR, 'Bold Title.mogrt');
const LOWER_ZIP = path.join(MOGRTS_DIR, 'Classic Lower Third Two Lines.mogrt');

const EXTRACT_BOLD = path.join(TEMP_DIR, 'bold_extracted');
const EXTRACT_LOWER = path.join(TEMP_DIR, 'lower_extracted');

function ensureExtracted(zipPath, dstDir) {
  if (!fs.existsSync(dstDir) || fs.readdirSync(dstDir).length === 0) {
    if (fs.existsSync(dstDir)) {
      fs.readdirSync(dstDir).forEach(f => fs.unlinkSync(path.join(dstDir, f)));
      fs.rmdirSync(dstDir);
    }
    const zP = zipPath.replace(/'/g, "''");
    const dP = dstDir.replace(/'/g, "''");
    execSync(`powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${zP}', '${dP}')"`, { windowsHide: true });
  }
}

ensureExtracted(BOLD_ZIP, EXTRACT_BOLD);
ensureExtracted(LOWER_ZIP, EXTRACT_LOWER);

// 2. Os 29 templates oficiais do Cherry Motion Studio 2.0
const CHERRY_TEMPLATES = [
  // --- SUITE: TEXT ANIMATION (AUTOEDIT AI & ELEVEN PERCENT) ---
  {
    cat: "text_anim", sub: "karaoke_bounce",
    name: "Cherry - Karaoke Word Bounce",
    fileName: "Cherry - Karaoke Word Bounce.mogrt",
    baseDir: EXTRACT_BOLD,
    badge: "TEXT ANIM #01",
    line1: "O SEGREDO DA",
    line2: "RETENÇÃO PERFEITA",
    colorAccent: "#FFD166", colorGold: "#FAF6EE",
    desc: "Karaoke com salto de mola sequencial por palavra e glow de retenção"
  },
  {
    cat: "text_anim", sub: "sliding_pill",
    name: "Cherry - Sliding Highlight Box",
    fileName: "Cherry - Sliding Highlight Box.mogrt",
    baseDir: EXTRACT_BOLD,
    badge: "TEXT ANIM #02",
    line1: "DOMINE O",
    line2: "ALGORITMO HOJE",
    colorAccent: "#FFD166", colorGold: "#12040C",
    desc: "Pílula deslizante com alto contraste que segue cada palavra"
  },
  {
    cat: "text_anim", sub: "blur_glow_in",
    name: "Cherry - Cinematic Blur & Glow",
    fileName: "Cherry - Cinematic Blur & Glow.mogrt",
    baseDir: EXTRACT_BOLD,
    badge: "TEXT ANIM #03",
    line1: "CRIE VÍDEOS COM",
    line2: "ALTO IMPACTO",
    colorAccent: "#FF2E7E", colorGold: "#FAF6EE",
    desc: "Desfoque óptico e condensação cinematográfica estilo Eleven Percent"
  },
  {
    cat: "text_anim", sub: "kinetic_stack",
    name: "Cherry - Kinetic Typography Stack",
    fileName: "Cherry - Kinetic Typography Stack.mogrt",
    baseDir: EXTRACT_BOLD,
    badge: "TEXT ANIM #04",
    line1: "SE VOCÊ QUER",
    line2: "MULTIPLICAR VENDAS",
    colorAccent: "#FFD166", colorGold: "#FF2E7E",
    desc: "Empilhamento tipográfico multi-linha com impacto elástico"
  },
  {
    cat: "text_anim", sub: "clean_callout",
    name: "Cherry - Minimal Clean Callout",
    fileName: "Cherry - Minimal Clean Callout.mogrt",
    baseDir: EXTRACT_LOWER,
    badge: "TEXT ANIM #05",
    line1: "ESTRUTURA DE",
    line2: "ALTA RETENÇÃO",
    colorAccent: "#FFD166", colorGold: "#FF2E7E",
    desc: "Ponto e linha guia de precisão com revelação de título e subtítulo"
  },
  {
    cat: "text_anim", sub: "typewriter_neon",
    name: "Cherry - Typewriter Pro + Cursor",
    fileName: "Cherry - Typewriter Pro.mogrt",
    baseDir: EXTRACT_BOLD,
    badge: "TEXT ANIM #06",
    line1: "DIGITANDO O CÓDIGO",
    line2: "SECRETO DO SUCESSO...",
    colorAccent: "#22D3EE", colorGold: "#FAF6EE",
    desc: "Digitação fluida caractere por caractere com cursor neon pulsante"
  },
  {
    cat: "text_anim", sub: "wave_kinetic",
    name: "Cherry - Floating Wave Text",
    fileName: "Cherry - Floating Wave Text.mogrt",
    baseDir: EXTRACT_BOLD,
    badge: "TEXT ANIM #07",
    line1: "ONDAS SUAVES DE",
    line2: "RETENÇÃO CONTÍNUA",
    colorAccent: "#FFD166", colorGold: "#FAF6EE",
    desc: "Ondulação senoidal suave contínua com entrada elástica"
  },
  {
    cat: "text_anim", sub: "split_reveal",
    name: "Cherry - Split-Mask Cinematic Title",
    fileName: "Cherry - Split-Mask Cinematic Title.mogrt",
    baseDir: EXTRACT_LOWER,
    badge: "TEXT ANIM #08",
    line1: "A REVOLUÇÃO DO",
    line2: "DESIGN CINÉTICO",
    colorAccent: "#FFD166", colorGold: "#FAF6EE",
    desc: "Linha central luminosa que divide e revela título e subtítulo opostos"
  },

  // --- SUITE: HOOKS INTERROGATIVOS (#07 a #11) ---
  {
    cat: "hook", sub: "frameless_kinetic",
    name: "Cherry - #11 Kinetic Sem Caixa",
    fileName: "Cherry - #11 Kinetic Sem Caixa.mogrt",
    baseDir: EXTRACT_BOLD,
    badge: "HOOK #11",
    line1: "VOCÊ SABE TRABALHAR",
    line2: "COM O FIO Y?",
    colorAccent: "#FFD166", colorGold: "#FAF6EE",
    desc: "Kinetic sem moldura com foco e ritmo editorial"
  },
  {
    cat: "hook", sub: "horizon_split_hero",
    name: "Cherry - #10 Horizon Split-Mask",
    fileName: "Cherry - #10 Horizon Split-Mask.mogrt",
    baseDir: EXTRACT_LOWER,
    badge: "HOOK #10",
    line1: "VOCÊ SABE TRABALHAR",
    line2: "COM O FIO Y?",
    colorAccent: "#D4AF37", colorGold: "#FAF6EE",
    desc: "Horizonte dourado cortando a tela com máscara superior e inferior"
  },
  {
    cat: "hook", sub: "y_lash_precision",
    name: "Cherry - #09 Kinetic Focus Capsule",
    fileName: "Cherry - #09 Kinetic Focus Capsule.mogrt",
    baseDir: EXTRACT_BOLD,
    badge: "HOOK #09",
    line1: "VOCÊ SABE TRABALHAR",
    line2: "FIO Y?",
    colorAccent: "#DFC89D", colorGold: "#14060C",
    desc: "Painel glass noir com cápsula de destaque em ouro acetinado"
  },
  {
    cat: "hook", sub: "dilemma_clash",
    name: "Cherry - #08 Editorial Dilemma",
    fileName: "Cherry - #08 Editorial Dilemma.mogrt",
    baseDir: EXTRACT_LOWER,
    badge: "HOOK #08",
    line1: "VOCÊ PREFERE?",
    line2: "LUCRO RÁPIDO OU QUALIDADE",
    colorAccent: "#DFC89D", colorGold: "#D81B60",
    desc: "Quadro editorial noir com ligatura caligráfica e filetes de alta costura"
  },
  {
    cat: "hook", sub: "stack_hero",
    name: "Cherry - #07B Stack Hero",
    fileName: "Cherry - #07B Stack Hero.mogrt",
    baseDir: EXTRACT_BOLD,
    badge: "HOOK #07B",
    line1: "QUANTO CUSTA",
    line2: "SOFT SNOW?",
    colorAccent: "#FFD166", colorGold: "#FAF6EE",
    desc: "Palavra hero em tamanho gigante com feixe de luz especular"
  },
  {
    cat: "hook", sub: "compact",
    name: "Cherry - #07A Natural Compacto",
    fileName: "Cherry - #07A Natural Compacto.mogrt",
    baseDir: EXTRACT_BOLD,
    badge: "HOOK #07A",
    line1: "QUANTO CUSTA",
    line2: "A SUA EXTENSÃO?",
    colorAccent: "#C5A76E", colorGold: "#FAF6EE",
    desc: "Quadro clássico compacto para abertura rápida e natural"
  },
  {
    cat: "hook", sub: "widescreen",
    name: "Cherry - #07C Power Widescreen",
    fileName: "Cherry - #07C Power Widescreen.mogrt",
    baseDir: EXTRACT_LOWER,
    badge: "HOOK #07C",
    line1: "QUANTO CUSTA",
    line2: "POR ATENDIMENTO?",
    colorAccent: "#D4AF37", colorGold: "#FF2E7E",
    desc: "Banner panorâmico de poder com divisória central metálica"
  },

  // --- SUITE: HAUTE COUTURE & ASSINATURAS (#05) ---
  {
    cat: "haute", sub: "05a",
    name: "Cherry - 05A Assinatura Cruzada",
    fileName: "Cherry - 05A Assinatura Cruzada.mogrt",
    baseDir: EXTRACT_LOWER,
    badge: "HAUTE #05A",
    line1: "ALTA FIXAÇÃO",
    line2: "PERFEITA",
    colorAccent: "#D4AF37", colorGold: "#EBE7DF",
    desc: "Título serifado cruzado com assinatura cursiva Pinyon Script"
  },
  {
    cat: "haute", sub: "05b",
    name: "Cherry - 05B Rhode Soft Focus",
    fileName: "Cherry - 05B Rhode Soft Focus.mogrt",
    baseDir: EXTRACT_BOLD,
    badge: "HAUTE #05B",
    line1: "ALTA FIXAÇÃO",
    line2: "BEAUTY CARE",
    colorAccent: "#D4AF37", colorGold: "#FAF6EE",
    desc: "Estética clean girl soft focus inspirada na marca Rhode"
  },
  {
    cat: "haute", sub: "05c",
    name: "Cherry - 05C Swash Ribbon",
    fileName: "Cherry - 05C Swash Ribbon.mogrt",
    baseDir: EXTRACT_LOWER,
    badge: "HAUTE #05C",
    line1: "ALTA FIXAÇÃO",
    line2: "perfeita",
    colorAccent: "#D4AF37", colorGold: "#FAF6EE",
    desc: "Fita e sublinhado swash caligráfico com brilho dourado"
  },
  {
    cat: "haute", sub: "05d",
    name: "Cherry - 05D Gold Knockout",
    fileName: "Cherry - 05D Gold Knockout.mogrt",
    baseDir: EXTRACT_LOWER,
    badge: "HAUTE #05D",
    line1: "ALTA FIXAÇÃO",
    line2: "GOLD EXCLUSIVE",
    colorAccent: "#D4AF37", colorGold: "#FFFFFF",
    desc: "Filetes dourados simétricos em moldura de alta joalheria"
  },

  // --- SUITE: TEMPLATES VIRAIS (T1-T4) ---
  {
    cat: "viral", sub: "kinetic_slam",
    name: "Cherry - T3 Kinetic Slam (Impacto 3D)",
    fileName: "Cherry - T3 Kinetic Slam.mogrt",
    baseDir: EXTRACT_BOLD,
    badge: "VIRAL T3",
    line1: "SEM DESMANCHAR",
    line2: "NUNCA!",
    colorAccent: "#FF2E7E", colorGold: "#FAF6EE",
    desc: "Slam de alto impacto com onda de choque 3D vibrante"
  },
  {
    cat: "viral", sub: "snap_pop",
    name: "Cherry - T1 Snap-Pop (Hormozi)",
    fileName: "Cherry - T1 Snap-Pop.mogrt",
    baseDir: EXTRACT_BOLD,
    badge: "VIRAL T1",
    line1: "FIOS",
    line2: "FININHOS",
    colorAccent: "#FFD166", colorGold: "#FFFFFF",
    desc: "Estilo Alex Hormozi: corte seco e pop de alta retenção"
  },
  {
    cat: "viral", sub: "pill_box",
    name: "Cherry - T2 Pill-Box (Vox High-End)",
    fileName: "Cherry - T2 Pill-Box.mogrt",
    baseDir: EXTRACT_BOLD,
    badge: "VIRAL T2",
    line1: "OLHAR",
    line2: "IMPECÁVEL",
    colorAccent: "#DFC89D", colorGold: "#1A130B",
    desc: "Caixa arredondada com contraste invertido sobre palavra-chave"
  },
  {
    cat: "viral", sub: "luxury_script",
    name: "Cherry - T4 Luxury Script (Write-On)",
    fileName: "Cherry - T4 Luxury Script.mogrt",
    baseDir: EXTRACT_LOWER,
    badge: "VIRAL T4",
    line1: "EXCLUSIVO",
    line2: "CHERRY LASH",
    colorAccent: "#DFC89D", colorGold: "#FAF6EE",
    desc: "Marca d'água caligráfica ao fundo com título serifado sobreposto"
  },

  // --- SUITE: PREÇOS & ELEMENTOS (#01-#06) ---
  {
    cat: "element", sub: "pop",
    name: "Cherry - #01 Luxury Price Pop",
    fileName: "Cherry - #01 Luxury Price Pop.mogrt",
    baseDir: EXTRACT_LOWER,
    badge: "ELEMENT #01",
    line1: "VALOR PROMOCIONAL",
    line2: "R$ 69,90",
    colorAccent: "#DFC89D", colorGold: "#382813",
    desc: "Tag de preço dourada com gradiente e borda especular"
  },
  {
    cat: "element", sub: "slash",
    name: "Cherry - #02 Price Slash (De/Por)",
    fileName: "Cherry - #02 Price Slash.mogrt",
    baseDir: EXTRACT_LOWER,
    badge: "ELEMENT #02",
    line1: "DE R$ 120,00",
    line2: "POR R$ 69,90",
    colorAccent: "#FF2E7E", colorGold: "#382813",
    desc: "Preço original riscado em vermelho com novo preço em destaque"
  },
  {
    cat: "element", sub: "count_up",
    name: "Cherry - #03 Count-up Odômetro",
    fileName: "Cherry - #03 Count-up Odom.mogrt",
    baseDir: EXTRACT_BOLD,
    badge: "ELEMENT #03",
    line1: "META ATINGIDA",
    line2: "15.800 FIOS",
    colorAccent: "#FFD166", colorGold: "#FFFFFF",
    desc: "Contagem de odômetro com barra de progresso luminosa"
  },
  {
    cat: "element", sub: "highlighter",
    name: "Cherry - #04 Highlighter Marker",
    fileName: "Cherry - #04 Highlighter Marker.mogrt",
    baseDir: EXTRACT_BOLD,
    badge: "ELEMENT #04",
    line1: "DESTAQUE REAL",
    line2: "IMPECÁVEL",
    colorAccent: "#FFD166", colorGold: "#1A130B",
    desc: "Tarja de marca-texto dinâmico para retenção visual"
  },
  {
    cat: "element", sub: "stamp",
    name: "Cherry - #05 Selo Selado (Stamp)",
    fileName: "Cherry - #05 Selo Selado.mogrt",
    baseDir: EXTRACT_BOLD,
    badge: "ELEMENT #05",
    line1: "100% GARANTIDO",
    line2: "CHERRY LASH",
    colorAccent: "#D4AF37", colorGold: "#382813",
    desc: "Selo circular com borda dourada e carimbo de impacto"
  },
  {
    cat: "element", sub: "lower_third",
    name: "Cherry - #06 Golden Lower-Third",
    fileName: "Cherry - #06 Golden Lower-Third.mogrt",
    baseDir: EXTRACT_LOWER,
    badge: "ELEMENT #06",
    line1: "GEOVANA PADOCA",
    line2: "ESPECIALISTA EM EXTENSÃO",
    colorAccent: "#FFD166", colorGold: "#FAF6EE",
    desc: "Lower third com placa de vidro noir e borda dourada"
  }
];

function generateThumbnail(tpl, destPng) {
  const fontPath = path.join(STUDIO_DIR, 'fonts', 'SF-Pro-Display-Bold.otf').replace(/\\/g, '/').replace(/:/g, '\\:');
  const accentColor = (tpl.colorAccent || '#FFD166').replace('#', '0x');
  const goldColor = (tpl.colorGold || '#FAF6EE').replace('#', '0x');

  const randId = Math.random().toString(36).substring(2, 8);
  const tBadge = path.join(TEMP_DIR, `badge_${randId}.txt`);
  const tLine1 = path.join(TEMP_DIR, `line1_${randId}.txt`);
  const tLine2 = path.join(TEMP_DIR, `line2_${randId}.txt`);

  fs.writeFileSync(tBadge, `CHERRY • ${tpl.badge}`, 'utf8');
  fs.writeFileSync(tLine1, tpl.line1 || 'TEXTO SUPERIOR', 'utf8');
  fs.writeFileSync(tLine2, tpl.line2 || 'TEXTO PRINCIPAL', 'utf8');

  const fBadge = tBadge.replace(/\\/g, '/').replace(/:/g, '\\:');
  const fLine1 = tLine1.replace(/\\/g, '/').replace(/:/g, '\\:');
  const fLine2 = tLine2.replace(/\\/g, '/').replace(/:/g, '\\:');

  const vf = [
    `drawbox=x=280:y=60:w=400:h=42:color=0x1f0b1b@1.0:t=fill`,
    `drawbox=x=280:y=60:w=400:h=42:color=${accentColor}@1.0:t=2`,
    `drawtext=fontfile='${fontPath}':textfile='${fBadge}':fontsize=15:fontcolor=${accentColor}:x=(w-text_w)/2:y=74`,
    `drawtext=fontfile='${fontPath}':textfile='${fLine1}':fontsize=32:fontcolor=0xE2E8F0:x=(w-text_w)/2:y=175`,
    `drawtext=fontfile='${fontPath}':textfile='${fLine2}':fontsize=48:fontcolor=${accentColor}:x=(w-text_w)/2:y=245`,
    `drawbox=x=280:y=340:w=400:h=3:color=${goldColor}@1.0:t=fill`,
    `drawtext=fontfile='${fontPath}':text='MOGRT NATIVO PREMIERE PRO • TEMPO REAL':fontsize=14:fontcolor=${goldColor}:x=(w-text_w)/2:y=395`
  ].join(',');

  try {
    execSync(`"${FFMPEG_BIN}" -y -f lavfi -i "color=c=0x120610:s=960x540:d=1" -vf "${vf}" -frames:v 1 "${destPng}"`, { stdio: 'pipe', windowsHide: true });
  } catch (e) {
    // Fallback: se falhar ffmpeg, copia thumbnail padrão existente da base
    const fallbackThumb = path.join(tpl.baseDir, 'thumb.png');
    if (fs.existsSync(fallbackThumb)) {
      fs.copyFileSync(fallbackThumb, destPng);
    }
  } finally {
    try { fs.unlinkSync(tBadge); } catch(e){}
    try { fs.unlinkSync(tLine1); } catch(e){}
    try { fs.unlinkSync(tLine2); } catch(e){}
  }
}

function buildAllMogrts() {
  console.log('--- COMPILANDO COLEÇÃO COMPLETA CHERRY MOTIONS (.MOGRT) ---');
  console.log(`Total de templates a gerar: ${CHERRY_TEMPLATES.length}`);

  const manifest = {};
  const batchList = [];

  CHERRY_TEMPLATES.forEach((tpl, idx) => {
    const tplDir = path.join(TEMP_DIR, `tpl_${idx}_${tpl.cat}_${tpl.sub}`);
    if (fs.existsSync(tplDir)) {
      fs.readdirSync(tplDir).forEach(f => fs.unlinkSync(path.join(tplDir, f)));
    } else {
      fs.mkdirSync(tplDir, { recursive: true });
    }

    // Copia arquivos da base
    fs.readdirSync(tpl.baseDir).forEach(f => {
      const src = path.join(tpl.baseDir, f);
      const dst = path.join(tplDir, f);
      if (fs.statSync(src).isFile()) {
        fs.copyFileSync(src, dst);
      }
    });

    // Customiza definition.json
    const defPath = path.join(tplDir, 'definition.json');
    if (fs.existsSync(defPath)) {
      try {
        const def = JSON.parse(fs.readFileSync(defPath, 'utf8'));
        def.capsuleName = tpl.name;
        def.capsuleID = `cherry-${tpl.cat}-${tpl.sub}`;
        if (def.capsuleNameLocalized && def.capsuleNameLocalized.strDB) {
          def.capsuleNameLocalized.strDB.forEach(entry => { entry.str = tpl.name; });
        }
        if (def.description) {
          def.description = tpl.desc;
        }

        // Atualiza os valores padrão das propriedades
        if (def.clientControls) {
          let textCount = 0;
          def.clientControls.forEach(ctrl => {
            if (ctrl.type === 6 && ctrl.value && ctrl.value.strDB) {
              const defaultVal = textCount === 0 ? (tpl.line1 || tpl.name) : (tpl.line2 || 'DESTAQUE');
              ctrl.value.strDB.forEach(e => { e.str = defaultVal; });
              textCount++;
            }
          });
        }
        fs.writeFileSync(defPath, JSON.stringify(def, null, 2), 'utf8');
      } catch(e){}
    }

    // Gera thumbnail customizada
    const thumbPng = path.join(tplDir, 'thumb.png');
    generateThumbnail(tpl, thumbPng);

    const finalMogrtPath = path.join(CHERRY_DIR, tpl.fileName);
    batchList.push({
      srcDirName: path.basename(tplDir),
      fileName: tpl.fileName,
      name: tpl.name
    });

    const key = `${tpl.cat}/${tpl.sub}`;
    manifest[key] = {
      key,
      cat: tpl.cat,
      sub: tpl.sub,
      name: tpl.name,
      fileName: tpl.fileName,
      fullPath: finalMogrtPath,
      badge: tpl.badge,
      desc: tpl.desc,
      line1: tpl.line1,
      line2: tpl.line2,
      colorAccent: tpl.colorAccent,
      colorGold: tpl.colorGold
    };
  });

  // Compressão em lote de altíssima velocidade via PowerShell (1 único processo)
  console.log('Compactando todos os arquivos .mogrt...');
  const batchScriptPath = path.join(TEMP_DIR, 'batch_zip.ps1');
  const batchJsonPath = path.join(TEMP_DIR, 'batch_list.json');

  fs.writeFileSync(batchJsonPath, JSON.stringify(batchList, null, 2), 'utf8');

  const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.IO.Compression.FileSystem
$tempDir = $PSScriptRoot
$outDir = (Resolve-Path "$PSScriptRoot\\..\\..\\mogrts\\Cherry Motions").Path
$items = Get-Content "$PSScriptRoot\\batch_list.json" -Raw | ConvertFrom-Json
foreach ($item in $items) {
    $srcPath = Join-Path $tempDir $item.srcDirName
    $finalPath = Join-Path $outDir $item.fileName
    if (Test-Path $finalPath) { Remove-Item $finalPath -Force }
    [System.IO.Compression.ZipFile]::CreateFromDirectory($srcPath, $finalPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)
    Write-Host "[OK] $($item.name)"
}
`;
  fs.writeFileSync(batchScriptPath, psScript, 'utf8');

  try {
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${batchScriptPath}"`, { stdio: 'inherit', windowsHide: true });
  } catch(e) {
    console.error('Erro no batch_zip powershell:', e.message);
  }

  // Grava o manifest.json oficial do catálogo
  const manifestPath = path.join(CHERRY_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\n📄 Manifest gravado: ${manifestPath}`);

  // Limpa pastas temporárias de templates
  batchList.forEach(item => {
    try {
      const srcDir = path.join(TEMP_DIR, item.srcDirName);
      if (fs.existsSync(srcDir)) {
        fs.readdirSync(srcDir).forEach(f => fs.unlinkSync(path.join(srcDir, f)));
        fs.rmdirSync(srcDir);
      }
    } catch(e){}
  });

  console.log(`\n🎉 SUCESSO TOTAL! ${batchList.length} arquivos .mogrt nativos compilados em:\n${CHERRY_DIR}`);
  return manifest;
}

if (require.main === module) {
  buildAllMogrts();
}

module.exports = {
  CHERRY_TEMPLATES,
  buildAllMogrts
};
