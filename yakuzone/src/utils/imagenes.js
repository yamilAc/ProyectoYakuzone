// Reduce una foto antes de subirla (las de celular suelen pesar varios MB):
// se redimensiona a un lado máximo de 1600 px y se guarda como JPG. Si el
// navegador no puede procesarla, se devuelve el archivo original.
export const comprimirImagen = (archivo, ladoMaximo = 1600, calidad = 0.82) =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, ladoMaximo / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => resolve(blob && blob.size < archivo.size ? new File([blob], 'foto.jpg', { type: 'image/jpeg' }) : archivo),
        'image/jpeg',
        calidad
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(archivo);
    };
    img.src = url;
  });
