// Image upload service
class UploadService {
    async uploadImage(file) {
        try {
            const resizedFile = await this.resizeImage(file, 350);

            const formData = new FormData();
            formData.append('file', resizedFile);
            formData.append('upload_preset', window.BookJournalConfig.CLOUDINARY_UPLOAD_PRESET);

            const response = await fetch(`https://api.cloudinary.com/v1_1/${window.BookJournalConfig.CLOUDINARY_CLOUD_NAME}/image/upload`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            return data.secure_url;
        } catch (error) {
            console.error('Error uploading image:', error);
            throw error;
        }
    }

    resizeImage(file, maxWidth) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();

            img.onload = () => {
                const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
                const newWidth = img.width * ratio;
                const newHeight = img.height * ratio;

                canvas.width = newWidth;
                canvas.height = newHeight;

                ctx.drawImage(img, 0, 0, newWidth, newHeight);

                canvas.toBlob((blob) => {
                    const resizedFile = new File([blob], file.name, {
                        type: file.type,
                        lastModified: Date.now()
                    });
                    resolve(resizedFile);
                }, file.type, 0.8);
            };

            img.src = URL.createObjectURL(file);
        });
    }

    async previewImage(event, previewId) {
        const file = event.target.files[0];
        const preview = document.getElementById(previewId);

        if (file && preview) {
            try {
                const reader = new FileReader();
                reader.onload = (e) => {
                    preview.innerHTML = `
                        <div style="text-align: center;">
                            <img src="${e.target.result}" alt="Preview" style="max-width: 100px; max-height: 150px; border-radius: 8px;">
                            <p style="font-size: 0.8rem; color: #666; margin: 5px 0 0 0;">
                                Original: ${(file.size / 1024).toFixed(1)}KB
                            </p>
                        </div>
                    `;
                };
                reader.readAsDataURL(file);

                if (this.resizeImage) {
                    const resizedFile = await this.resizeImage(file, 350);
                    const resizedReader = new FileReader();
                    resizedReader.onload = (e) => {
                        preview.innerHTML += `
                            <div style="text-align: center; margin-top: 10px;">
                                <img src="${e.target.result}" alt="Resized Preview" style="max-width: 100px; max-height: 150px; border-radius: 8px; border: 2px solid #4285f4;">
                                <p style="font-size: 0.8rem; color: #4285f4; margin: 5px 0 0 0;">
                                    Resized: ${(resizedFile.size / 1024).toFixed(1)}KB (350px width)
                                </p>
                            </div>
                        `;
                    };
                    resizedReader.readAsDataURL(resizedFile);
                }
            } catch (error) {
                console.error('Error previewing image:', error);
                preview.innerHTML = `<p style="color: #e74c3c;">Error previewing image</p>`;
            }
        } else if (preview) {
            preview.innerHTML = '';
        }
    }
}

window.UploadService = UploadService;