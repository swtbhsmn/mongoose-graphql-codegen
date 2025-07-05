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
npm install mongoose graphql graphql-scalars validator pluralize @graphql-tools/load-files @graphql-tools/merge
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
##  TypeScript Generate for all models in the models directory
```bash
npx mongoose-graphql-codegen
```

##  Javascript Generate for all models in the models directory
```bash
npx mongoose-graphql-codegen js=true
```


### JavaScript (CommonJS) graphql-codegen generate for a single Mongoose model
```bash
npx mongoose-graphql-codegen model=./models/User.js js=true
```

## 📁 Output Structure

After generation:
```
graphql-codegen/
  user/
    User.graphql
    UserResolver.js / .ts
  index.ts
  scalarResolvers.js / .ts
```

---

## 🛠 Integrate into Apollo GraphQL Server

```js
//<filename>.js
const { ApolloServer } = require('@apollo/server');
const {typeDefs,resolvers} = require('../graphql-codegen')

async function createApolloServer() {
  const server = new ApolloServer({
    typeDefs,
    resolvers
  });
  await server.start();
  return server;
}

module.exports = createApolloServer;

// server.js
const bodyParser = require('body-parser');
const { expressMiddleware } = require('@apollo/server/express4');
const createApolloServer = require('./graphql/server');
(async () => {
const apolloServer = await createApolloServer();
app.use('/graphql', bodyParser.json(), expressMiddleware(apolloServer));
})();

// Use in ApolloServer, Mercurius, Yoga, etc.
```

---

## 📌 Coming Soon
- `--outDir` support

---

© 2025 — Built with ❤️ for modern devs.
