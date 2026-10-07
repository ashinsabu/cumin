package docs

import _ "embed"

// JSON is the raw Swagger/OpenAPI 2.0 specification for the Cumin API.
// It is served at GET /api/docs/swagger.json.
//
//go:embed swagger.json
var JSON []byte
