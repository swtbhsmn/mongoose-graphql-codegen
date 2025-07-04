# mongoose-graphql-codegen

Generate GraphQL schema and resolvers automatically from Mongoose models — supports BSON types and advanced validation.

---

## ✨ Features

- Generates `.graphql` type definitions
- Creates resolvers with status code-aware GraphQL errors
- Supports both **JavaScript (CommonJS)** and **TypeScript**
- Handles BSON/extended scalar types: `Decimal`, `Long`, `Date`, `UUID`, `Base64`, etc.

---

## 📦 Installation

### Install via npm
```bash
npm install -D mongoose-graphql-codegen
```

---

## 📋 Prerequisites

Your project must include:
```bash
npm install mongoose graphql graphql-scalars validator pluralize
```

---

## 🧠 Example Mongoose Model

```js
// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true, minlength: 6 },
  roles: {
    type: [String],
    enum: ['user', 'admin', 'moderator'],
    default: ['user']
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'banned'],
    default: 'active'
  },
  lastLogin: Date
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
```

---

## ⚙️ Usage

### TypeScript graphql-codegen (default)
```bash
npx mongoose-graphql-codegen ./models/User.js
```

### JavaScript (CommonJS) graphql-codegen
```bash
npx mongoose-graphql-codegen ./models/User.js --js
```

### Using in npm script
```json
"scripts": {
  "generate:gql": "mongoose-graphql-codegen ./models/User.js --js"
}
```
Then run:
```bash
npm run generate:gql
```

---

## 📁 Output Structure

After generation:
```
graphql-codegen/
  user/
    User.graphql
    UserResolver.js / .ts
  scalarResolvers.js / .ts
```

---

## 🛠 Integrate into GraphQL Server

```js
const { resolvers } = require('./graphql-codegen/user/UserResolver');
const { scalarResolvers } = require('./graphql-codegen/scalarResolvers');

const combinedResolvers = {
  ...resolvers,
  ...scalarResolvers,
};

// Use in ApolloServer, Mercurius, Yoga, etc.
```

---

## 📌 Coming Soon
- `--outDir` support
- Multiple model generation
- ESM support
- GraphQL federation/directives

---

MIT © 2025 — Built with ❤️ for modern devs.
