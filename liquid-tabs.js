(() => {
  const bar = document.querySelector('.section-tabs');
  const tabs = [...bar.querySelectorAll('[role="tab"]')];
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('liquid-optics');
  svg.innerHTML = `
    <defs>
      <g id="tab-art"></g>
      <filter id="tab-refraction" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
        <feImage class="refraction-map" x="0" y="0" preserveAspectRatio="none" result="field"/>
        <feDisplacementMap class="refraction-pass" in="SourceGraphic" in2="field" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
      <rect id="lens-shape"/>
      <clipPath id="lens-clip"><use href="#lens-shape"/></clipPath>
      <mask id="outside-lens" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
        <rect width="100%" height="100%" fill="white"/><use href="#lens-shape" fill="black"/>
      </mask>
      <linearGradient id="glass-body" x1="0" y1="0" x2=".9" y2="1">
        <stop stop-color="white" stop-opacity=".33"/><stop offset=".25" stop-color="#b1d5ef" stop-opacity=".08"/>
        <stop offset=".72" stop-color="#798aa7" stop-opacity=".12"/><stop offset="1" stop-color="white" stop-opacity=".27"/>
      </linearGradient>
      <linearGradient id="glass-rim" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2=".45">
        <stop stop-color="#84bdff"/><stop offset=".13" stop-color="#cfb0ff"/><stop offset=".25" stop-color="white"/>
        <stop offset=".52" stop-color="#bcefff" stop-opacity=".22"/><stop offset=".72" stop-color="#ffca83"/>
        <stop offset=".83" stop-color="#ff98b1"/><stop offset="1" stop-color="#a1ebff"/>
      </linearGradient>
      <radialGradient id="glass-glint"><stop stop-color="white" stop-opacity=".8"/>
        <stop offset=".35" stop-color="#c9ebff" stop-opacity=".22"/><stop offset="1" stop-color="white" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <use href="#tab-art" mask="url(#outside-lens)" class="glass-normal"/>
    <use href="#lens-shape" fill="url(#glass-body)"/>
    <g clip-path="url(#lens-clip)">
      <g class="glass-local"><g class="glass-filter"><g class="glass-image"><use href="#tab-art" class="glass-fringe" x="-.95" fill="#56cfff"/>
        <use href="#tab-art" class="glass-fringe" x=".95" fill="#ff88b6"/>
        <use href="#tab-art" class="glass-focused"/></g></g></g>
      <ellipse class="glass-highlight" fill="url(#glass-glint)"/>
    </g>
    <use href="#lens-shape" fill="none" stroke="url(#glass-rim)" stroke-width="1.5"/>`;
  const part = sel => svg.querySelector(sel);
  const art = part('#tab-art'), shape = part('#lens-shape'), lensImage = part('.glass-image');
  const glint = part('.glass-highlight'), rim = part('#glass-rim');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let position = 0, speed = 0, target = 0, frame = 0, last = 0, pressed = false;
  let width = 0, height = 0, step = 0, origin = 0, touch = .3;

  const local = part('.glass-local'), filtered = part('.glass-filter');
  const filter = part('#tab-refraction'), mapImage = part('.refraction-map');
  const displacement = part('.refraction-pass');
  let generator, lastMapSize = '';
  function prepareMap() {
    if (!generator || !step || height <= 8) return;
    const key = [step,height].join('/');
    if (key === lastMapSize) return;
    const halfH = (height-8)/2;
    const uri = generator.generate({
      lensHalfWidth:step/2, lensHalfHeight:halfH, borderRadius:halfH,
      depth:.85, curvature:.65, bend:.85, bendWidth:.28, clipToShape:true, softEdge:true
    });
    mapImage.setAttribute('href',uri);
    mapImage.setAttributeNS('http://www.w3.org/1999/xlink','href',uri);
    filtered.setAttribute('filter','url(#tab-refraction)');
    lastMapSize = key;
  }
  function layout() {
    const box = svg.getBoundingClientRect();
    width = box.width; height = box.height;
    if (!width || !height) return;
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    art.replaceChildren();
    tabs.forEach((tab,i) => {
      const rect = tab.getBoundingClientRect();
      if (!i) { step = rect.width; origin = rect.left - box.left; }
      const cx = rect.left - box.left + rect.width / 2;
      const icon = tab.querySelector('svg').cloneNode(true);
      icon.setAttribute('x', cx - 9.5); icon.setAttribute('y', height / 2 - 16);
      icon.setAttribute('width', 19); icon.setAttribute('height', 19);
      icon.setAttribute('stroke', 'inherit');
      const text = document.createElementNS(svgNS,'text');
      text.textContent = tab.textContent.trim();
      const style = getComputedStyle(tab);
      text.setAttribute('text-anchor','middle');
      text.setAttribute('stroke','none');
      text.setAttribute('x',cx); text.setAttribute('y',height / 2 + 16);
      text.style.font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
      art.append(icon,text);
    });
    prepareMap();
    draw();
  }

  function draw() {
    if (!step || !width) return;
    const cx = origin + (position + .5) * step, cy = height / 2;
    const stretch = motion.matches ? 0 : Math.min(.17,Math.abs(speed)*.024);
    const w = Math.min(width-2,step*(1+stretch)+(pressed?5:0));
    const h = height-(pressed?3:8);
    const left = Math.max(1,Math.min(width-w-1,cx-w/2));
    for (const [key,value] of Object.entries({x:left,y:cy-h/2,width:w,height:h,rx:h/2}))
      shape.setAttribute(key,value);
    const top = cy-h/2;
    local.setAttribute('transform',`translate(${left} ${top})`);
    for (const node of [filter,mapImage]) {
      node.setAttribute('width',w);node.setAttribute('height',h);
    }
    filter.setAttribute('x',0);filter.setAttribute('y',0);
    displacement.setAttribute('scale',pressed ? 23 : 12);
    const zoom = pressed ? 1.25 : 1.09;
    lensImage.setAttribute('transform',`translate(${cx-left} ${cy-top}) scale(${zoom+stretch} ${zoom}) translate(${-cx} ${-cy})`);
    const angle = -25 + position*62 + touch*40;
    rim.setAttribute('gradientTransform',`rotate(${angle} .5 .5)`);
    glint.setAttribute('cx',left+w*(.15+.7*touch));
    glint.setAttribute('cy',cy-h*.48); glint.setAttribute('rx',w*.36);glint.setAttribute('ry',h*.19);
  }
  function animate(now) {
    const dt = Math.min(.024,(now-last)/1000 || .016); last=now;
    speed += ((target-position)*420-speed*34)*dt;
    position += speed*dt;
    if (motion.matches || (Math.abs(target-position)<.001 && Math.abs(speed)<.01)){
      position=target;speed=0;frame=0;draw();return;
    }
    draw();frame=requestAnimationFrame(animate);
  }
  function update() {
    const drag = bar.style.getPropertyValue('--drag-index');
    target = drag ? Number(drag) : Math.max(0,tabs.findIndex(t=>t.getAttribute('aria-selected')==='true'));
    if(!frame){last=performance.now();frame=requestAnimationFrame(animate);}
  }
  function track(e){
    if(!e.isPrimary)return;
    touch=Math.max(0,Math.min(1,(e.clientX-svg.getBoundingClientRect().left-origin-position*step)/step));
    draw();
  }
  import('./vendor/liquid-glass/displacement.js').then(({createLensMapGenerator})=>{
    generator=createLensMapGenerator(128);
    prepareMap();
    draw();
  }).catch(()=>{/* Keep the magnifying lens if the optical module is unavailable. */});
  bar.append(svg);
  layout();
  bar.classList.add('refractive');
  new ResizeObserver(layout).observe(bar);
  new MutationObserver(update).observe(bar,{attributes:true,subtree:true,attributeFilter:['aria-selected','style'],childList:false});
  bar.addEventListener('pointerdown',e=>{if(e.isPrimary){pressed=true;track(e);}});
  bar.addEventListener('pointermove',e=>{if(pressed)track(e);});
  function release(){if(pressed){pressed=false;update();}}
  window.addEventListener('pointerup',release);
  window.addEventListener('pointercancel',release);
  window.addEventListener('blur',release);
  update();
})();
