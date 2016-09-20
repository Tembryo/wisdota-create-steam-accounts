FROM node:5

VOLUME ["/source"]
WORKDIR /source

CMD ["node", "create-steam-accounts.js"]
