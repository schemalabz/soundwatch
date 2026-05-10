{
  description = "Soundwatch Athens - live noise monitoring platform";

  inputs = {
    # Pin to nixos-24.11 which has Prisma 5.x engines matching our Prisma version
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
    nixpkgs-unstable.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, nixpkgs-unstable, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        pkgs-unstable = nixpkgs-unstable.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = [
            pkgs-unstable.nodejs_22
            pkgs-unstable.corepack_22
            pkgs.docker-compose
            pkgs.openssl
            pkgs.prisma-engines
          ];

          env = {
            PRISMA_QUERY_ENGINE_LIBRARY = "${pkgs.prisma-engines}/lib/libquery_engine.node";
            PRISMA_QUERY_ENGINE_BINARY = "${pkgs.prisma-engines}/bin/query-engine";
            PRISMA_SCHEMA_ENGINE_BINARY = "${pkgs.prisma-engines}/bin/schema-engine";
          };

          shellHook = ''
            echo "Soundwatch Athens dev shell"
            echo "Node.js $(node --version)"
            echo ""
            echo "Start dev services: docker compose -f docker-compose.dev.yml up -d"
          '';
        };
      });
}
