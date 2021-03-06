import 'tippy.js/dist/tippy.css';
import 'tippy.js/animations/scale.css';
import debounce from 'lodash.debounce';
import React, { useRef, useState, useEffect } from 'react';
import { select, event } from 'd3-selection';
import ResizeObserver from 'resize-observer-polyfill';
import 'd3-transition';
import { range, min, max, descending } from 'd3-array';
import d3Cloud from 'd3-cloud';
import clonedeep from 'lodash.clonedeep';
import seedrandom from 'seedrandom';
import tippy from 'tippy.js';
import { dispatch } from 'd3-dispatch';
import { scaleOrdinal, scaleLinear, scaleSqrt, scaleLog } from 'd3-scale';
import { schemeCategory10 } from 'd3-scale-chromatic';

function useResponsiveSvgSelection(minSize, initialSize) {
  const elementRef = useRef();
  const [size, setSize] = useState(initialSize);
  const [selection, setSelection] = useState(null);
  useEffect(() => {
    const element = elementRef.current; // Set svg selection

    const svg = select(element).append('svg').style('display', 'block'); // Native inline svg leaves undesired white space

    const selection = svg.append('g');
    setSelection(selection);

    function updateSize(width, height) {
      svg.attr('height', height).attr('width', width);
      selection.attr('transform', `translate(${width / 2}, ${height / 2})`);
      setSize([width, height]);
    }

    let width = 0;
    let height = 0;

    if (initialSize === undefined) {
      // Use parentNode size if resized has not occurred
      width = element.parentElement.offsetWidth;
      height = element.parentElement.offsetHeight;
    } else {
      // Use initialSize if it is provided
      [width, height] = initialSize;
    }

    width = Math.max(width, minSize[0]);
    height = Math.max(height, minSize[1]);
    updateSize(width, height); // Update resize using a resize observer

    const resizeObserver = new ResizeObserver(entries => {
      if (!entries || entries.length === 0) {
        return;
      }

      if (initialSize === undefined) {
        const {
          width,
          height
        } = entries[0].contentRect;
        updateSize(width, height);
      }
    });
    resizeObserver.observe(element); // Cleanup

    return () => {
      resizeObserver.unobserve(element);
      select(element).selectAll('*').remove();
    };
  }, [initialSize, minSize]);
  return [elementRef, selection, size];
}

// @ts-nocheck
const cloudRadians = Math.PI / 180,
      cw = 1 << 11 >> 5,
      ch = 1 << 11;
function Cloud() {
  let size = [256, 256],
      text = cloudText,
      font = cloudFont,
      fontSize = cloudFontSize,
      fontStyle = cloudFontNormal,
      fontWeight = cloudFontNormal,
      rotate = cloudRotate,
      padding = cloudPadding,
      spiral = archimedeanSpiral,
      words = [],
      timeInterval = Infinity,
      event = dispatch('word', 'end'),
      random = Math.random,
      cloud = {},
      canvas = cloudCanvas;
  let killed = false;

  cloud.canvas = function (_) {
    return arguments.length ? (canvas = functor(_), cloud) : canvas;
  };

  cloud.start = function () {
    let contextAndRatio = getContext(canvas()),
        board = zeroArray((size[0] >> 5) * size[1]),
        bounds = null,
        n = words.length,
        tags = [],
        data = words.map(function (d, i) {
      d.text = text.call(this, d, i);
      d.font = font.call(this, d, i);
      d.style = fontStyle.call(this, d, i);
      d.weight = fontWeight.call(this, d, i);
      d.rotate = rotate.call(this, d, i);
      d.size = ~~fontSize.call(this, d, i);
      d.padding = padding.call(this, d, i);
      return d;
    }).sort(function (a, b) {
      return b.size - a.size;
    }); // Added by react-wordcloud
    // Allows to calculate a subset of data instead of all of the words at once

    function multiStep(from, to) {
      for (let i = from; i < to; i += 1) {
        const d = data[i];
        d.x = size[0] * (random() + 0.5) >> 1;
        d.y = size[1] * (random() + 0.5) >> 1;
        cloudSprite(contextAndRatio, d, data, i);

        if (d.hasText && place(board, d, bounds)) {
          tags.push(d);
          event.call('word', cloud, d);
          if (bounds) cloudBounds(bounds, d);else bounds = [{
            x: d.x + d.x0,
            y: d.y + d.y0
          }, {
            x: d.x + d.x1,
            y: d.y + d.y1
          }]; // Temporary hack

          d.x -= size[0] >> 1;
          d.y -= size[1] >> 1;
        }
      }
    } // Added by react-wordcloud
    // Iterates dataset using setTimeout in order to prevent blocking of the main thread


    function loop(i) {
      const step = 50;
      const from = i * step;
      const to = Math.min((i + 1) * step, words.length);
      multiStep(from, to);

      if (killed) {
        return;
      }

      if (to < words.length) {
        setTimeout(() => loop(i + 1), 0);
      } else {
        cloud.stop();
        event.call('end', cloud, tags, bounds);
      }
    }

    setTimeout(() => loop(0), 0);
    return cloud;
  };

  cloud.revive = () => {
    killed = false;
    return cloud;
  };

  cloud.stop = function () {

    killed = true;
    return cloud;
  };

  function getContext(canvas) {
    canvas.width = canvas.height = 1;
    const ratio = Math.sqrt(canvas.getContext('2d').getImageData(0, 0, 1, 1).data.length >> 2);
    canvas.width = (cw << 5) / ratio;
    canvas.height = ch / ratio;
    const context = canvas.getContext('2d');
    context.fillStyle = context.strokeStyle = 'red';
    context.textAlign = 'center';
    return {
      context: context,
      ratio: ratio
    };
  }

  function place(board, tag, bounds) {
    let perimeter = [{
      x: 0,
      y: 0
    }, {
      x: size[0],
      y: size[1]
    }],
        startX = tag.x,
        startY = tag.y,
        maxDelta = Math.sqrt(size[0] * size[0] + size[1] * size[1]),
        s = spiral(size),
        dt = random() < 0.5 ? 1 : -1,
        t = -dt,
        dxdy,
        dx,
        dy;

    while (dxdy = s(t += dt)) {
      dx = ~~dxdy[0];
      dy = ~~dxdy[1];
      if (Math.min(Math.abs(dx), Math.abs(dy)) >= maxDelta) break;
      tag.x = startX + dx;
      tag.y = startY + dy;
      if (tag.x + tag.x0 < 0 || tag.y + tag.y0 < 0 || tag.x + tag.x1 > size[0] || tag.y + tag.y1 > size[1]) continue; // TODO only check for collisions within current bounds.

      if (!bounds || !cloudCollide(tag, board, size[0])) {
        if (!bounds || collideRects(tag, bounds)) {
          var sprite = tag.sprite,
              w = tag.width >> 5,
              sw = size[0] >> 5,
              lx = tag.x - (w << 4),
              sx = lx & 0x7f,
              msx = 32 - sx,
              h = tag.y1 - tag.y0,
              x = (tag.y + tag.y0) * sw + (lx >> 5),
              last;

          for (let j = 0; j < h; j++) {
            last = 0;

            for (let i = 0; i <= w; i++) {
              board[x + i] |= last << msx | (i < w ? (last = sprite[j * w + i]) >>> sx : 0);
            }

            x += sw;
          }

          delete tag.sprite;
          return true;
        }
      }
    }

    return false;
  }

  cloud.timeInterval = function (_) {
    return arguments.length ? (timeInterval = _ == null ? Infinity : _, cloud) : timeInterval;
  };

  cloud.words = function (_) {
    return arguments.length ? (words = _, cloud) : words;
  };

  cloud.size = function (_) {
    return arguments.length ? (size = [+_[0], +_[1]], cloud) : size;
  };

  cloud.font = function (_) {
    return arguments.length ? (font = functor(_), cloud) : font;
  };

  cloud.fontStyle = function (_) {
    return arguments.length ? (fontStyle = functor(_), cloud) : fontStyle;
  };

  cloud.fontWeight = function (_) {
    return arguments.length ? (fontWeight = functor(_), cloud) : fontWeight;
  };

  cloud.rotate = function (_) {
    return arguments.length ? (rotate = functor(_), cloud) : rotate;
  };

  cloud.text = function (_) {
    return arguments.length ? (text = functor(_), cloud) : text;
  };

  cloud.spiral = function (_) {
    return arguments.length ? (spiral = spirals[_] || _, cloud) : spiral;
  };

  cloud.fontSize = function (_) {
    return arguments.length ? (fontSize = functor(_), cloud) : fontSize;
  };

  cloud.padding = function (_) {
    return arguments.length ? (padding = functor(_), cloud) : padding;
  };

  cloud.random = function (_) {
    return arguments.length ? (random = _, cloud) : random;
  };

  cloud.on = function () {
    const value = event.on.apply(event, arguments);
    return value === event ? cloud : value;
  };

  return cloud;
}

function cloudText(d) {
  return d.text;
}

function cloudFont() {
  return 'serif';
}

function cloudFontNormal() {
  return 'normal';
}

function cloudFontSize(d) {
  return Math.sqrt(d.value);
}

function cloudRotate() {
  return (~~(Math.random() * 6) - 3) * 30;
}

function cloudPadding() {
  return 1;
} // Fetches a monochrome sprite bitmap for the specified text.
// Load in batches for speed.


function cloudSprite(contextAndRatio, d, data, di) {
  if (d.sprite) return;
  const c = contextAndRatio.context,
        ratio = contextAndRatio.ratio;
  c.clearRect(0, 0, (cw << 5) / ratio, ch / ratio);
  let x = 0,
      y = 0,
      maxh = 0,
      n = data.length;
  --di;

  while (++di < n) {
    d = data[di];
    c.save();
    c.font = d.style + ' ' + d.weight + ' ' + ~~((d.size + 1) / ratio) + 'px ' + d.font;
    var w = c.measureText(d.text + 'm').width * ratio,
        h = d.size << 1;

    if (d.rotate) {
      const sr = Math.sin(d.rotate * cloudRadians),
            cr = Math.cos(d.rotate * cloudRadians),
            wcr = w * cr,
            wsr = w * sr,
            hcr = h * cr,
            hsr = h * sr;
      w = Math.max(Math.abs(wcr + hsr), Math.abs(wcr - hsr)) + 0x1f >> 5 << 5;
      h = ~~Math.max(Math.abs(wsr + hcr), Math.abs(wsr - hcr));
    } else {
      w = w + 0x1f >> 5 << 5;
    }

    if (h > maxh) maxh = h;

    if (x + w >= cw << 5) {
      x = 0;
      y += maxh;
      maxh = 0;
    }

    if (y + h >= ch) break;
    c.translate((x + (w >> 1)) / ratio, (y + (h >> 1)) / ratio);
    if (d.rotate) c.rotate(d.rotate * cloudRadians);
    c.fillText(d.text, 0, 0);

    if (d.padding) {
      c.lineWidth = 2 * d.padding;
      c.strokeText(d.text, 0, 0);
    }

    c.restore();
    d.width = w;
    d.height = h;
    d.xoff = x;
    d.yoff = y;
    d.x1 = w >> 1;
    d.y1 = h >> 1;
    d.x0 = -d.x1;
    d.y0 = -d.y1;
    d.hasText = true;
    x += w;
  }

  const pixels = c.getImageData(0, 0, (cw << 5) / ratio, ch / ratio).data,
        sprite = [];

  while (--di >= 0) {
    d = data[di];
    if (!d.hasText) continue;
    var w = d.width,
        w32 = w >> 5,
        h = d.y1 - d.y0; // Zero the buffer

    for (var i = 0; i < h * w32; i++) sprite[i] = 0;

    x = d.xoff;
    if (x == null) return;
    y = d.yoff;
    let seen = 0,
        seenRow = -1;

    for (let j = 0; j < h; j++) {
      for (var i = 0; i < w; i++) {
        const k = w32 * j + (i >> 5),
              m = pixels[(y + j) * (cw << 5) + (x + i) << 2] ? 1 << 31 - i % 32 : 0;
        sprite[k] |= m;
        seen |= m;
      }

      if (seen) seenRow = j;else {
        d.y0++;
        h--;
        j--;
        y++;
      }
    }

    d.y1 = d.y0 + seenRow;
    d.sprite = sprite.slice(0, (d.y1 - d.y0) * w32);
  }
} // Use mask-based collision detection.


function cloudCollide(tag, board, sw) {
  sw >>= 5;
  let sprite = tag.sprite,
      w = tag.width >> 5,
      lx = tag.x - (w << 4),
      sx = lx & 0x7f,
      msx = 32 - sx,
      h = tag.y1 - tag.y0,
      x = (tag.y + tag.y0) * sw + (lx >> 5),
      last;

  for (let j = 0; j < h; j++) {
    last = 0;

    for (let i = 0; i <= w; i++) {
      if ((last << msx | (i < w ? (last = sprite[j * w + i]) >>> sx : 0)) & board[x + i]) return true;
    }

    x += sw;
  }

  return false;
}

function cloudBounds(bounds, d) {
  const b0 = bounds[0],
        b1 = bounds[1];
  if (d.x + d.x0 < b0.x) b0.x = d.x + d.x0;
  if (d.y + d.y0 < b0.y) b0.y = d.y + d.y0;
  if (d.x + d.x1 > b1.x) b1.x = d.x + d.x1;
  if (d.y + d.y1 > b1.y) b1.y = d.y + d.y1;
}

function collideRects(a, b) {
  return a.x + a.x1 > b[0].x && a.x + a.x0 < b[1].x && a.y + a.y1 > b[0].y && a.y + a.y0 < b[1].y;
}

function archimedeanSpiral(size) {
  const e = size[0] / size[1];
  return function (t) {
    return [e * (t *= 0.1) * Math.cos(t), t * Math.sin(t)];
  };
}

function rectangularSpiral(size) {
  let dy = 4,
      dx = dy * size[0] / size[1],
      x = 0,
      y = 0;
  return function (t) {
    const sign = t < 0 ? -1 : 1; // See triangular numbers: T_n = n * (n + 1) / 2.

    switch (Math.sqrt(1 + 4 * sign * t) - sign & 3) {
      case 0:
        x += dx;
        break;

      case 1:
        y += dy;
        break;

      case 2:
        x -= dx;
        break;

      default:
        y -= dy;
        break;
    }

    return [x, y];
  };
}

function zeroArray(n) {
  const a = new Uint32Array(n);
  return a;
}

function cloudCanvas() {
  return document.createElement('canvas');
}

function functor(d) {
  return typeof d === 'function' ? d : function () {
    return d;
  };
}

var spirals = {
  archimedean: archimedeanSpiral,
  rectangular: rectangularSpiral
};

function choose(array, random = Math.random) {
  return array[Math.floor(random() * array.length)];
}
function getDefaultColors() {
  return range(20).map(number => number.toString()).map(scaleOrdinal(schemeCategory10));
}
function getFontScale(words, fontSizes, scale) {
  const minSize = min(words, word => Number(word.value));
  const maxSize = max(words, word => Number(word.value));
  let scaleFunction;

  switch (scale) {
    case 'log':
      scaleFunction = scaleLog;
      break;

    case 'sqrt':
      scaleFunction = scaleSqrt;
      break;

    case 'linear':
    default:
      scaleFunction = scaleLinear;
      break;
  }

  const fontScale = scaleFunction().domain([minSize, maxSize]).range(fontSizes);
  return fontScale;
}
function getFontSize(word) {
  return `${word.size}px`;
}
function getText(word) {
  return word.text;
}
function getTransform(word) {
  const translate = `translate(${word.x}, ${word.y})`;
  const rotate = typeof word.rotate === 'number' ? `rotate(${word.rotate})` : '';
  return translate + rotate;
}
function rotate(rotations, rotationAngles, random) {
  if (rotations < 1) {
    return 0;
  }

  let angles = [];

  if (rotations === 1) {
    angles = [rotationAngles[0]];
  } else {
    angles = [...rotationAngles];
    const increment = (rotationAngles[1] - rotationAngles[0]) / (rotations - 1);
    let angle = rotationAngles[0] + increment;

    while (angle < rotationAngles[1]) {
      angles.push(angle);
      angle += increment;
    }
  }

  return choose(angles, random);
}

function render({
  callbacks,
  options,
  random,
  selection,
  words
}) {
  const {
    getWordColor,
    getWordTooltip,
    onWordClick,
    onWordMouseOver,
    onWordMouseOut
  } = callbacks;
  const {
    colors,
    enableTooltip,
    fontStyle,
    fontWeight
  } = options;
  const {
    fontFamily,
    transitionDuration
  } = options;

  function getFill(word) {
    return getWordColor ? getWordColor(word) : choose(colors, random);
  } // Load words


  let tooltipInstance;
  const vizWords = selection.selectAll('text').data(words);
  vizWords.join(enter => enter.append('text').on('click', word => {
    if (onWordClick) {
      onWordClick(word, event);
    }
  }).on('mouseover', word => {
    if (enableTooltip) {
      tooltipInstance = tippy(event.target, {
        animation: 'scale',
        arrow: true,
        content: () => getWordTooltip(word)
      });
    }

    if (onWordMouseOver) {
      onWordMouseOver(word, event);
    }
  }).on('mouseout', word => {
    if (tooltipInstance) {
      tooltipInstance.destroy();
    }

    if (onWordMouseOut) {
      onWordMouseOut(word, event);
    }
  }).attr('cursor', onWordClick ? 'pointer' : 'default').attr('fill', getFill).attr('font-family', fontFamily).attr('font-style', fontStyle).attr('font-weight', fontWeight).attr('text-anchor', 'middle').attr('transform', 'translate(0, 0) rotate(0)').call(enter => enter.transition().duration(transitionDuration).attr('font-size', getFontSize).attr('transform', getTransform).text(getText)), update => update.transition().duration(transitionDuration).attr('fill', getFill).attr('font-family', fontFamily).attr('font-size', getFontSize).attr('transform', getTransform).text(getText), exit => exit.transition().duration(transitionDuration).attr('fill-opacity', 0).remove());
}
function layout({
  callbacks,
  maxWords,
  options,
  selection,
  size,
  words
}) {
  const MAX_LAYOUT_ATTEMPTS = 10;
  const SHRINK_FACTOR = 0.95;
  const {
    deterministic,
    enableOptimizations,
    fontFamily,
    fontStyle,
    fontSizes,
    fontWeight,
    padding,
    rotations,
    rotationAngles,
    spiral,
    scale
  } = options;
  const sortedWords = words.concat().sort((x, y) => descending(x.value, y.value)).slice(0, maxWords);
  const random = deterministic ? seedrandom('deterministic') : seedrandom();
  let cloud;

  if (enableOptimizations) {
    cloud = Cloud();
  } else {
    cloud = d3Cloud();
  }

  cloud.size(size).padding(padding).words(clonedeep(sortedWords)).rotate(() => {
    if (rotations === undefined) {
      // Default rotation algorithm
      return (~~(random() * 6) - 3) * 30;
    }

    return rotate(rotations, rotationAngles, random);
  }).spiral(spiral).random(random).text(getText).font(fontFamily).fontStyle(fontStyle).fontWeight(fontWeight);

  function draw(fontSizes, attempts = 1) {
    if (enableOptimizations) {
      cloud.revive();
    }

    cloud.fontSize(word => {
      const fontScale = getFontScale(sortedWords, fontSizes, scale);
      return fontScale(word.value);
    }).on('end', computedWords => {
      /** KNOWN ISSUE: https://github.com/jasondavies/d3-cloud/issues/36
       * Recursively layout and decrease font-sizes by a SHRINK_FACTOR.
       * Bail out with a warning message after MAX_LAYOUT_ATTEMPTS.
       */
      if (sortedWords.length !== computedWords.length && attempts <= MAX_LAYOUT_ATTEMPTS) {
        if (attempts === MAX_LAYOUT_ATTEMPTS) {
          console.warn(`Unable to layout ${sortedWords.length - computedWords.length} word(s) after ${attempts} attempts.  Consider: (1) Increasing the container/component size. (2) Lowering the max font size. (3) Limiting the rotation angles.`);
        }

        const minFontSize = Math.max(fontSizes[0] * SHRINK_FACTOR, 1);
        const maxFontSize = Math.max(fontSizes[1] * SHRINK_FACTOR, minFontSize);
        draw([minFontSize, maxFontSize], attempts + 1);
      } else {
        render({
          callbacks,
          options,
          random,
          selection,
          words: computedWords
        });
      }
    }).start();
  }

  draw(fontSizes);
}

const defaultCallbacks = {
  getWordTooltip: ({
    text,
    value
  }) => `${text} (${value})`
};
console.log(123456789);
const defaultOptions = {
  colors: getDefaultColors(),
  deterministic: false,
  enableOptimizations: false,
  enableTooltip: true,
  fontFamily: "times new roman",
  fontSizes: [4, 32],
  fontStyle: "normal",
  fontWeight: "normal",
  padding: 1,
  rotationAngles: [-90, 90],
  scale: "sqrt",
  spiral: "rectangular",
  transitionDuration: 600
};

function ReactWordCloud({
  callbacks,
  maxWords = 100,
  minSize,
  options,
  size: initialSize,
  words
}) {
  const mergedCallbacks = { ...defaultCallbacks,
    ...callbacks
  };
  const mergedOptions = { ...defaultOptions,
    ...options
  };
  const [ref, selection, size] = useResponsiveSvgSelection(minSize, initialSize);
  const render = useRef(debounce(layout, 100));
  useEffect(() => {
    if (selection) {
      render.current({
        callbacks: mergedCallbacks,
        maxWords,
        options: mergedOptions,
        selection,
        size,
        words
      });
    }
  }, [maxWords, mergedCallbacks, mergedOptions, selection, size, words]);
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    style: {
      height: "100%",
      width: "100%"
    }
  });
}

ReactWordCloud.defaultProps = {
  callbacks: defaultCallbacks,
  maxWords: 100,
  minSize: [300, 300],
  options: defaultOptions
};

export default ReactWordCloud;
export { defaultCallbacks, defaultOptions };
