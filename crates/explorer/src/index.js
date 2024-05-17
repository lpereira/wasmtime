/* global window, document */

/*** State *********************************************************************/

class State {
  constructor(wat, asm) {
    this.wat = wat;
    this.asm = asm;
  }
}

const state = (window.STATE = new State(window.WAT, window.ASM));

/*** Colors for Offsets **********************************************************/

const offsetToRgb = new Map();

// Get the RGB color for the given offset.  (Memoize to avoid recalculating.)

const rgbToTriple = (rgb) => [
  (rgb >> 16) & 0xff,
  (rgb >> 8) & 0xff,
  rgb & 0xff,
];
const rgbToLuminance = (rgb) => {
  // Use the NTSC color space (https://en.wikipedia.org/wiki/YIQ) to determine
  // the luminance of this color.
  let [r, g, b] = rgbToTriple(rgb);
  return (r * 299.0 + g * 587.0 + b * 114.0) / 1000.0;
};
const rgbToCss = (rgb) => `rgb(${rgbToTriple(rgb).join(",")})`;

const rgbForOffset = (offset) => {
  let color = offsetToRgb[offset];
  if (color !== undefined) return color;

  const crc24 = (crc, byte) => {
    crc ^= byte << 16;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x800000 ? (crc << 1) ^ 0xfa5711 : crc << 1) & 0xffffff;
    }
    return crc;
  };
  let orig_offset = offset;
  for (color = offset; offset; offset >>= 8)
    color = crc24(color, offset & 0xff);
  color = rgbToLuminance(color) > 127 ? color ^ 0xa5a5a5 : color;
  offsetToRgb[orig_offset] = color;
  return color;
};

const adjustColorForOffset = (element, offset) => {
  let backgroundColor = rgbForOffset(offset);
  element.style.backgroundColor = rgbToCss(backgroundColor);
  element.style.color =
    rgbToLuminance(backgroundColor) > 128 ? "#101010" : "#dddddd";
};

/*** Rendering *****************************************************************/

const repeat = (s, n) => {
  return s.repeat(n >= 0 ? n : 0);
};

const renderAddress = (addr) => {
  let hex = addr.toString(16);
  return repeat("0", 8 - hex.length) + hex;
};

const renderBytes = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    if (i != 0) {
      s += " ";
    }
    const hexByte = bytes[i].toString(16);
    s += hexByte.length == 2 ? hexByte : "0" + hexByte;
  }
  return s + repeat(" ", 30 - s.length);
};

const renderInst = (mnemonic, operands) => {
  if (operands.length == 0) {
    return mnemonic;
  } else {
    return mnemonic + " " + operands;
  }
};

const linkElements = (element) => {
  const eachElementWithSameWasmOff = (event, closure) => {
    let offset = event.target.dataset.wasmOffset;
    if (offset !== null) {
      let elems = document.querySelectorAll(`[data-wasm-offset="${offset}"]`);
      for (const elem of elems) closure(elem);
    }
  };
  element.addEventListener("click", (event) => {
    eachElementWithSameWasmOff(event, (elem) =>
      elem.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      }),
    );
  });
  element.addEventListener("mouseenter", (event) =>
    eachElementWithSameWasmOff(event, (elem) => elem.classList.add("hovered")),
  );
  element.addEventListener("mouseleave", (event) =>
    eachElementWithSameWasmOff(event, (elem) =>
      elem.classList.remove("hovered"),
    ),
  );
};

const createDivForCode = () => {
  let div = document.createElement("div");
  div.classList.add("highlight");
  return div;
};

// Render the ASM.
let lastOffset = null;
for (const func of state.asm.functions) {
  const funcElem = document.createElement("div");

  const funcHeader = document.createElement("h3");
  let func_name =
    func.name === null ? `function[${func.func_index}]` : func.name;
  let demangled_name =
    func.demangled_name !== null ? func.demangled_name : func_name;
  funcHeader.textContent = `Disassembly of function <${demangled_name}>:`;
  funcHeader.title = `Function ${func.func_index}: ${func_name}`;
  funcElem.appendChild(funcHeader);

  let currentBlock = createDivForCode();
  let disasmBuffer = [];

  const addCurrentBlock = (offset) => {
    currentBlock.setAttribute("data-wasm-offset", offset);
    if (offset !== null) adjustColorForOffset(currentBlock, offset);
    currentBlock.innerText = disasmBuffer.join("\n");
    linkElements(currentBlock);
    funcElem.appendChild(currentBlock);
    disasmBuffer = [];
  };

  for (const inst of func.instructions) {
    if (lastOffset !== inst.wasm_offset) {
      addCurrentBlock(inst.wasm_offset);
      currentBlock = createDivForCode();
      lastOffset = inst.wasm_offset;
    }

    disasmBuffer.push(
      `${renderAddress(inst.address)}    ${renderBytes(inst.bytes)}    ${renderInst(inst.mnemonic, inst.operands)}`,
    );
  }
  addCurrentBlock(lastOffset);

  document.getElementById("asm").appendChild(funcElem);
}

// Render the WAT.
for (const chunk of state.wat.chunks) {
  if (chunk.wasm_offset === null) continue;
  const block = createDivForCode();
  block.dataset.wasmOffset = chunk.wasm_offset;
  block.innerText = chunk.wat;

  if (offsetToRgb[chunk.wasm_offset] !== undefined) {
    adjustColorForOffset(block, chunk.wasm_offset);
    linkElements(block);
  }

  document.getElementById("wat").appendChild(block);
}
