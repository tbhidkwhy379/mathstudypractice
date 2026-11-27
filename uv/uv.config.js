self.__uv$config = {
  prefix: "/uv/service/",
  encodeUrl: Ultraviolet.codec.xor.encode,
  decodeUrl: Ultraviolet.codec.xor.decode,
  handler: "/public/uv/uv.handler.js",
  bundle: "/public/uv/uv.bundle.js",
  config: "/uv/uv.config.js",
  sw: "/public/uv/uv.sw.js"
};
