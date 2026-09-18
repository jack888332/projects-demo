const text = value => typeof value === 'string' ? value.trim() : ''
const isBlob = value => typeof Blob !== 'undefined' && value instanceof Blob

export function projectAirServiceMaterial(attachment, serviceId, index) {
  const source = attachment && typeof attachment === 'object' ? attachment : {}
  const content = isBlob(attachment) ? attachment : source.content ?? source.file ?? null
  const fileName = text(source.fileName) || text(source.name) || text(content?.name)
  return {
    id: text(source.id) || `${serviceId}-MATERIAL-${index + 1}`,
    name: text(source.materialName) || text(source.name) || fileName,
    fileName, content, type: text(source.type) || text(content?.type),
  }
}

export function getAirServiceMaterialFile(material) {
  if (!material || !text(material.fileName)) throw new Error('该材料没有可下载的文件')
  const content = material.content
  const blob = isBlob(content) ? content : typeof content === 'string' && content.length
    ? new Blob([content], { type: material.type || 'text/plain;charset=utf-8' }) : null
  if (!blob?.size) throw new Error('该材料没有可下载的文件内容')
  return { name: material.fileName, blob }
}
