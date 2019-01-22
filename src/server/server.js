const electron = require('electron');
const { ipcMain } = electron;
const dbController = require('./DBMetadata/pgMetadataRetriever.js');
const logicController = require('./DBMetadata/pgMetadataProcessor');
const {parseGraphqlServer} = require('./Generators/typeGenerator.js');
const parseClientMutations = require('./Generators/clientMutationGenerator.js');
const parseClientQueries = require('./Generators/clientQueryGenerator.js');
const fs = require('fs');
const JSZip = require('jszip');
const path = require('path');

let schemaMetaData;
let mutationsMetaData;
let queriesMetaData;

ipcMain.on('url', async (event, info) => {
  info = JSON.parse(info);
  if(info.value.length === 0){
    info.value = dbController.fuseConnectionString(info);
  }
  let dbMetaData =  await dbController.getSchemaInfoPG(info.value);
  const formattedMetaData = await logicController.formatMetaData(dbMetaData);
  schemaMetaData = await parseGraphqlServer(formattedMetaData.tables, info.type, info.value);
  mutationsMetaData = await parseClientMutations(formattedMetaData.tables);
  queriesMetaData = await parseClientQueries(formattedMetaData.tables);
  const gqlData = {
    schema: schemaMetaData,
    mutations: mutationsMetaData,
    queries: queriesMetaData,
  }
  event.sender.send('data', JSON.stringify(gqlData));
});

ipcMain.on('directory', async(event, directory) => {
  const zip = new JSZip();

  zip.file("Schema.js", schemaMetaData);
  zip.file("clientMutations.js", mutationsMetaData);
  zip.file("clientQueries.js", queriesMetaData);

  zip
    .generateNodeStream({type:'nodebuffer',streamFiles:true})
    .pipe(fs.createWriteStream(path.join(directory,'SwitchQL.zip')))
    .on('finish', function () {
    // JSZip generates a readable stream with a "end" event,
    // but is piped here in a writable stream which emits a "finish" event.
      event.sender.send('Confirmed ZIP', 'Finished!')
  });
});

